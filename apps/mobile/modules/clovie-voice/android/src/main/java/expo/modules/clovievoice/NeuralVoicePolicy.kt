package expo.modules.clovievoice

/** Which text-to-speech engine should read the next sentence. */
enum class EngineChoice { NEURAL, SYSTEM, WAIT, NONE }

/** Download life cycle of the neural voice model, as exposed to JS (`wire`). */
enum class NeuralVoiceState(val wire: String) {
  ABSENT("absent"),
  DOWNLOADING("downloading"),
  READY("ready"),
  FAILED("failed"),
}

/** The one pinned model release. Changing any value here means a new, re-hashed model. */
object NeuralVoiceModel {
  const val URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-en-v0_19.tar.bz2"
  const val SHA256 = "c9f0dd393615805b0bab050c340834d5e684e732aec91c0e860cd30e982c08bd"
  const val ARCHIVE_BYTES = 103_248_205L
  /** The folder inside the archive; also the folder name under the app's files dir once extracted. */
  const val DIR_NAME = "kokoro-int8-en-v0_19"
  val REQUIRED_FILES = listOf("model.int8.onnx", "voices.bin", "tokens.txt", "espeak-ng-data")

  /** Speaker 1 of this model's 11 voices (af, af_bella, af_nicole, af_sarah, af_sky, am_adam, ...): warm, friendly, female. */
  const val SPEAKER_ID = 1
  const val SPEAKER_NAME = "af_bella"

  /** A touch brisker than 1.0, so replies sound alive without losing clarity. */
  const val SPEED = 1.05f
}

/** Pure decisions for the neural voice: engine choice, download resume, archive safety and thread count. */
object NeuralVoicePolicy {
  /**
   * The neural voice speaks only when its model is already in memory and has not failed; otherwise the system
   * engine does. [WAIT] means neither is ready yet, so the reply is queued; [NONE] means no engine can ever speak (the caller just finishes).
   */
  fun choose(isNeuralLoaded: Boolean, isNeuralBroken: Boolean, isSystemReady: Boolean, isSystemFailed: Boolean): EngineChoice = when {
    isNeuralLoaded && !isNeuralBroken -> EngineChoice.NEURAL
    isSystemReady -> EngineChoice.SYSTEM
    isSystemFailed -> EngineChoice.NONE
    else -> EngineChoice.WAIT
  }

  /** Bytes already in the partial file that can be kept (resume), or 0 to start over. */
  fun resumeOffset(partialBytes: Long, expectedBytes: Long): Long =
    if (partialBytes in 1 until expectedBytes) partialBytes else 0L

  /** True when `status` is the answer to a Range request that continued where we stopped. */
  fun isResumeAccepted(httpStatus: Int, offset: Long): Boolean = offset > 0 && httpStatus == 206

  /** An archive entry must stay inside the target folder: no absolute paths and no `..` segments. */
  fun isSafeEntryName(name: String): Boolean {
    val normal = name.replace('\\', '/')
    if (normal.startsWith("/") || Regex("^[A-Za-z]:").containsMatchIn(normal)) return false
    return normal.split('/').none { it == ".." }
  }

  fun isChecksumMatch(actualHex: String, expectedHex: String): Boolean = actualHex.equals(expectedHex, ignoreCase = true)

  /** The model is usable only when every required entry exists. */
  fun isComplete(present: Set<String>): Boolean = NeuralVoiceModel.REQUIRED_FILES.all { it in present }

  /** 0..1 progress, clamped; unknown totals report 0. */
  fun progress(downloaded: Long, total: Long): Double =
    if (total <= 0) 0.0 else (downloaded.toDouble() / total).coerceIn(0.0, 1.0)

  /** Two to four threads: enough for fast synthesis, leaving cores for the UI and audio. */
  fun threadsFor(cores: Int): Int = (cores / 2).coerceIn(2, 4)
}
