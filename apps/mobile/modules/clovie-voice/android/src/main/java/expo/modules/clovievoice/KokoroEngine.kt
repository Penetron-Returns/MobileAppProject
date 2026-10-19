package expo.modules.clovievoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Kokoro neural voice, fully on the phone (sherpa-onnx). A single worker thread synthesises one sentence at a time
 * and streams the samples into an [AudioTrack] as they arrive, so sound starts before the sentence is finished.
 * Load the model once with [load] (off the main thread); [release] frees it. Any failure is reported through
 * [SpeechEngineListener.onError] so [VoiceSpeaker] can fall back to the system voice. Never logs text.
 */
class KokoroEngine(
  private val context: Context,
  private val listener: SpeechEngineListener,
) : SpeechEngine {
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor { Thread(it, "clovie-kokoro").apply { isDaemon = true } }
  private val loader = Executors.newSingleThreadExecutor { Thread(it, "clovie-kokoro-load").apply { isDaemon = true } }
  private val trackLock = Any()
  private val inFlight = AtomicInteger(0)
  @Volatile private var epoch = 0
  @Volatile private var tts: OfflineTts? = null
  @Volatile private var isLoading = false
  private var track: AudioTrack? = null
  private var framesWritten = 0L

  /** True once the model is in memory and can speak. */
  val isLoaded: Boolean get() = tts != null

  /** Loads the model on a background thread; a no-op when loaded, loading, or not downloaded. */
  fun load() {
    if (tts != null || isLoading || !NeuralVoiceStore.isReady(context)) return
    isLoading = true
    loader.execute {
      val started = SystemClock.elapsedRealtime()
      try {
        tts = createTts()
        Log.i(TAG, "kokoro loaded ms=${SystemClock.elapsedRealtime() - started} sampleRate=${tts?.sampleRate()}")
      } catch (e: Throwable) {
        Log.w(TAG, "kokoro load failed: ${e.javaClass.simpleName}")
      } finally {
        isLoading = false
      }
    }
  }

  private fun createTts(): OfflineTts {
    val dir = NeuralVoiceStore.modelDir(context).absolutePath
    val kokoro = OfflineTtsKokoroModelConfig(
      model = "$dir/model.int8.onnx",
      voices = "$dir/voices.bin",
      tokens = "$dir/tokens.txt",
      dataDir = "$dir/espeak-ng-data",
    )
    val model = OfflineTtsModelConfig(
      kokoro = kokoro,
      numThreads = NeuralVoicePolicy.threadsFor(Runtime.getRuntime().availableProcessors()),
      debug = false,
      provider = "cpu",
    )
    return OfflineTts(null, OfflineTtsConfig(model = model))
  }

  /** Frees the model and the audio track (low memory, or the voice UI is gone). It reloads on the next [load]. */
  fun release() {
    stop()
    worker.execute {
      tts?.release()
      tts = null
    }
  }

  override fun speak(text: String, utteranceId: String, flush: Boolean): Boolean {
    if (tts == null) return false
    if (flush) stop()
    val myEpoch = epoch
    inFlight.incrementAndGet()
    worker.execute {
      try {
        if (myEpoch == epoch) synthesise(text, utteranceId, myEpoch)
      } finally {
        inFlight.decrementAndGet()
      }
    }
    return true
  }

  override fun stop() {
    epoch++
    releaseTrack()
  }

  private fun synthesise(text: String, utteranceId: String, myEpoch: Int) {
    val engine = tts ?: return fail(utteranceId, myEpoch)
    val started = SystemClock.elapsedRealtime()
    var isFirst = true
    fun onSamples(samples: FloatArray): Boolean {
      if (myEpoch != epoch) return false
      if (!write(engine.sampleRate(), samples, myEpoch)) return false
      if (isFirst) {
        isFirst = false
        Log.i(TAG, "kokoro firstAudioMs=${SystemClock.elapsedRealtime() - started} sentenceChars=${text.length}")
        main.post { if (myEpoch == epoch) listener.onStart(utteranceId) }
      }
      return true
    }
    try {
      val audio = engine.generateWithCallback(text, NeuralVoiceModel.SPEAKER_ID, NeuralVoiceModel.SPEED) { samples ->
        if (onSamples(samples)) 1 else 0
      }
      // Some model paths return the whole sentence at the end instead of streaming it.
      if (isFirst && myEpoch == epoch && audio.samples.isNotEmpty()) onSamples(audio.samples)
      if (myEpoch != epoch) return
      if (isFirst) return fail(utteranceId, myEpoch) // nothing was produced
      val target = synchronized(trackLock) { framesWritten }
      awaitPlayback(utteranceId, target, myEpoch)
    } catch (e: Throwable) {
      Log.w(TAG, "kokoro synth failed: ${e.javaClass.simpleName}")
      fail(utteranceId, myEpoch)
    }
  }

  /** Blocking write of one chunk; creates and starts the track on the first chunk. False when stopped or broken. */
  private fun write(sampleRate: Int, samples: FloatArray, myEpoch: Int): Boolean {
    val current = synchronized(trackLock) {
      if (myEpoch != epoch) return false
      track ?: createTrack(sampleRate).also { track = it; framesWritten = 0 }
    }
    val written = current.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
    if (written < 0) return false
    synchronized(trackLock) { if (track === current) framesWritten += written }
    if (current.playState != AudioTrack.PLAYSTATE_PLAYING && myEpoch == epoch) current.play()
    return true
  }

  private fun createTrack(sampleRate: Int): AudioTrack {
    val minBytes = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
    return AudioTrack.Builder()
      .setAudioAttributes(VoiceAudio.attributes(AudioAttributes.CONTENT_TYPE_SPEECH))
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build(),
      )
      .setBufferSizeInBytes(maxOf(minBytes * 2, sampleRate)) // about 250 ms of float samples
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
  }

  /** Reports the sentence done once the speaker has really played it (the head catches the written frames). */
  private fun awaitPlayback(utteranceId: String, target: Long, myEpoch: Int) {
    val sampleRate = tts?.sampleRate() ?: DEFAULT_RATE
    val deadline = SystemClock.elapsedRealtime() + PLAYBACK_GRACE_MS + (target * 1000 / sampleRate)
    val poll = object : Runnable {
      override fun run() {
        if (myEpoch != epoch) return
        val head = synchronized(trackLock) { track?.playbackHeadPosition?.toLong() }
        if (head == null || head >= target || SystemClock.elapsedRealtime() > deadline) {
          if (inFlight.get() == 0) releaseTrack() // idle: free the audio path until the next reply
          listener.onDone(utteranceId)
        } else {
          main.postDelayed(this, POLL_MS)
        }
      }
    }
    main.post(poll)
  }

  private fun fail(utteranceId: String, myEpoch: Int) {
    main.post { if (myEpoch == epoch) listener.onError(utteranceId) }
  }

  private fun releaseTrack() {
    val old = synchronized(trackLock) { track.also { track = null; framesWritten = 0 } } ?: return
    try {
      old.pause()
      old.flush()
      old.release()
    } catch (_: Exception) {
      // already released
    }
  }

  private companion object {
    const val TAG = "ClovieVoice"
    const val DEFAULT_RATE = 24_000
    const val POLL_MS = 15L
    const val PLAYBACK_GRACE_MS = 1_500L
  }
}
