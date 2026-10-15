package expo.modules.clovievoice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import java.nio.FloatBuffer

/**
 * Kotlin port of the livekit-wakeword Swift SDK's `WakeWordModel.predict`
 * (https://github.com/livekit/livekit-wakeword, Apache-2.0): three ONNX models in a row.
 *
 *  1. melspectrogram.onnx: 1-3 s of 16 kHz float audio ("input", [1, n]) to mel frames
 *     ("output", [1, 1, frames, 32]), rescaled as x / 10 + 2 (openWakeWord's normalisation).
 *  2. embedding_model.onnx: windows of 76 mel frames, stride 8 ("input_1", [B, 76, 32, 1]),
 *     to 96-dim embeddings ("conv2d_19").
 *  3. the classifier: the last 16 embeddings ("embeddings", [1, 16, 96]) to a score ("score"),
 *     already a sigmoid in the exported model.
 *
 * Anything too short to fill 16 embedding windows scores 0, as in the reference.
 */
class WakeWordEngine private constructor(
  private val env: OrtEnvironment,
  private val mel: OrtSession,
  private val embedding: OrtSession,
  private val classifier: OrtSession,
) : AutoCloseable {

  /** Scores `pcm` (16 kHz mono, signed 16-bit, oldest first) in [0, 1]. */
  fun score(pcm: ShortArray): Float {
    if (pcm.size < MIN_MEL_SAMPLES) return 0f
    val count = minOf(pcm.size, MAX_MEL_SAMPLES)
    val offset = pcm.size - count // keep the most recent audio
    val audio = FloatArray(count) { pcm[offset + it] / 32768f }

    val melOut = runMel(audio)
    val frames = melOut.size / MEL_BINS
    if (frames < EMBEDDING_WINDOW) return 0f
    val windowCount = (frames - EMBEDDING_WINDOW) / EMBEDDING_STRIDE + 1
    if (windowCount < CLASSIFIER_EMBEDDINGS) return 0f

    val batch = embeddingBatch(melOut, windowCount - CLASSIFIER_EMBEDDINGS)
    val embeddings = runEmbedding(batch)
    return runClassifier(embeddings)
  }

  private fun runMel(audio: FloatArray): FloatArray {
    val shape = longArrayOf(1, audio.size.toLong())
    OnnxTensor.createTensor(env, FloatBuffer.wrap(audio), shape).use { input ->
      mel.run(mapOf("input" to input)).use { result ->
        val tensor = result.get("output").get() as OnnxTensor
        val dims = tensor.info.shape
        check(dims.size == 4 && dims[0] == 1L && dims[1] == 1L && dims[3] == MEL_BINS.toLong()) {
          "unexpected mel output shape ${dims.toList()}"
        }
        val out = tensor.floatBuffer.toArray()
        for (i in out.indices) out[i] = out[i] * 0.1f + 2f
        return out
      }
    }
  }

  private fun runEmbedding(windows: FloatArray): FloatArray {
    val shape = longArrayOf(
      CLASSIFIER_EMBEDDINGS.toLong(), EMBEDDING_WINDOW.toLong(), MEL_BINS.toLong(), 1,
    )
    OnnxTensor.createTensor(env, FloatBuffer.wrap(windows), shape).use { input ->
      embedding.run(mapOf("input_1" to input)).use { result ->
        val tensor = result.get("conv2d_19").get() as OnnxTensor
        // (batch, 1, 1, 96) flattened to batch * 96 floats.
        return tensor.floatBuffer.toArray()
      }
    }
  }

  private fun runClassifier(embeddings: FloatArray): Float {
    val shape = longArrayOf(1, CLASSIFIER_EMBEDDINGS.toLong(), EMBEDDING_DIM.toLong())
    OnnxTensor.createTensor(env, FloatBuffer.wrap(embeddings), shape).use { input ->
      classifier.run(mapOf("embeddings" to input)).use { result ->
        val tensor = result.get("score").get() as OnnxTensor
        return tensor.floatBuffer.get(0)
      }
    }
  }

  /** The last 16 windows of 76 mel frames, stride 8, as one (16, 76, 32, 1) batch. */
  private fun embeddingBatch(melFrames: FloatArray, startWindow: Int): FloatArray {
    val perWindow = EMBEDDING_WINDOW * MEL_BINS
    val batch = FloatArray(CLASSIFIER_EMBEDDINGS * perWindow)
    for (b in 0 until CLASSIFIER_EMBEDDINGS) {
      val src = (startWindow + b) * EMBEDDING_STRIDE * MEL_BINS
      System.arraycopy(melFrames, src, batch, b * perWindow, perWindow)
    }
    return batch
  }

  override fun close() {
    classifier.close()
    embedding.close()
    mel.close()
  }

  companion object {
    const val SAMPLE_RATE = 16_000
    private const val MEL_BINS = 32
    private const val EMBEDDING_WINDOW = 76
    private const val EMBEDDING_STRIDE = 8
    private const val EMBEDDING_DIM = 96
    private const val CLASSIFIER_EMBEDDINGS = 16
    private const val MIN_MEL_SAMPLES = 16_000
    private const val MAX_MEL_SAMPLES = 48_000

    /** Loads the bundled mel and embedding models and the classifier named by `classifier`. */
    fun load(context: Context, classifier: String): WakeWordEngine {
      val env = OrtEnvironment.getEnvironment()
      val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(2) }
      val sessions = ArrayList<OrtSession>(3)
      try {
        for (spec in listOf(VoiceConfig.MEL_ASSET, VoiceConfig.EMBEDDING_ASSET, classifier)) {
          sessions.add(env.createSession(VoiceConfig.readModel(context, spec), options))
        }
      } catch (e: Exception) {
        sessions.forEach { it.close() }
        throw e
      }
      return WakeWordEngine(env, sessions[0], sessions[1], sessions[2])
    }

    private fun FloatBuffer.toArray(): FloatArray {
      val out = FloatArray(remaining())
      get(out)
      return out
    }
  }
}

/**
 * Turns a stream of scores into detections: a score at or above `threshold`
 * fires once, then is ignored for `cooldownMs` so one utterance cannot fire twice.
 */
class WakeWordGate(
  private val threshold: Float = DEFAULT_THRESHOLD,
  private val cooldownMs: Long = DEFAULT_COOLDOWN_MS,
) {
  private var lastDetectionAt: Long? = null

  fun accept(score: Float, nowMs: Long): Boolean {
    if (score < threshold) return false
    val last = lastDetectionAt
    if (last != null && nowMs - last < cooldownMs) return false
    lastDetectionAt = nowMs
    return true
  }

  companion object {
    const val DEFAULT_THRESHOLD = 0.5f
    const val DEFAULT_COOLDOWN_MS = 2_000L
  }
}
