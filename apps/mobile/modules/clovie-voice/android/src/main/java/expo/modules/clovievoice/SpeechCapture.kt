package expo.modules.clovievoice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

/** The end of one listen: `text` is the transcript, or null with `reason` (`no_speech`, `permission`, `error`, `timeout`, `unavailable`). */
data class SttOutcome(val text: String?, val reason: String)

/**
 * One spoken command through Android's own recogniser. On-device where the phone offers it
 * (API 31+), otherwise the default recogniser asked to prefer offline. South African English
 * first, then US English when the first is not installed. Errors are logged by code and name
 * (never text) and retried per `SttPolicy`. A watchdog ends the listen if nothing arrives in time.
 * `SpeechRecognizer` is main-thread only.
 */
class SpeechCapture(private val context: Context, private val onLevel: (Float) -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var onDone: ((SttOutcome) -> Unit)? = null

  /** True while a command is being listened for. */
  val isBusy: Boolean
    get() = onDone != null
  private var onStarted: (() -> Unit)? = null
  private var attempt = SttAttempt(0, true)
  private var isOnDevice = false
  private var startedAt = 0L
  private val watchdog = Runnable {
    Log.w(TAG, "stt watchdog fired elapsedMs=${elapsed()}")
    finish(null, "timeout")
  }
  private val startAttempt = Runnable { begin() }

  /**
   * Listens once after `startDelayMs` (lets the wake-word recorder's microphone release settle).
   * `onDone` runs exactly once, unless `cancel()` is called first.
   */
  fun listen(startDelayMs: Long, onStarted: () -> Unit, onDone: (SttOutcome) -> Unit) {
    cancel()
    this.onStarted = onStarted
    this.onDone = onDone
    attempt = SttAttempt(0, true)
    startedAt = SystemClock.elapsedRealtime()
    main.postDelayed(watchdog, LISTEN_TIMEOUT_MS)
    main.postDelayed(startAttempt, startDelayMs)
  }

  fun cancel() {
    onDone = null
    main.removeCallbacks(watchdog)
    main.removeCallbacks(startAttempt)
    destroyRecognizer()
  }

  private fun begin() {
    if (onDone == null) return
    destroyRecognizer()
    val created = create(attempt.useOnDevice) ?: return finish(null, "unavailable")
    recognizer = created
    created.setRecognitionListener(listener)
    try {
      created.startListening(recognitionIntent(LOCALES[attempt.localeIndex]))
    } catch (e: RuntimeException) {
      Log.w(TAG, "stt startListening threw ${e.javaClass.simpleName}")
      return handleError(SttErrors.CLIENT)
    }
    Log.i(TAG, "stt start attempt=${attempt.number} locale=${LOCALES[attempt.localeIndex]} onDevice=$isOnDevice")
    onStarted?.invoke()
    onStarted = null
  }

  /** On-device when asked and available (API 31+), else the default recogniser; null when neither exists. */
  private fun create(wantOnDevice: Boolean): SpeechRecognizer? {
    isOnDevice = false
    if (wantOnDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        if (SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
          val onDevice = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
          isOnDevice = true
          return onDevice
        }
      } catch (e: RuntimeException) {
        Log.w(TAG, "stt on-device create threw ${e.javaClass.simpleName}")
      }
    }
    return try {
      if (SpeechRecognizer.isRecognitionAvailable(context)) SpeechRecognizer.createSpeechRecognizer(context) else null
    } catch (e: RuntimeException) {
      Log.w(TAG, "stt default create threw ${e.javaClass.simpleName}")
      null
    }
  }

  private fun recognitionIntent(locale: String) =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, SILENCE_MS)
    }

  private fun elapsed() = SystemClock.elapsedRealtime() - startedAt

  private fun handleError(code: Int) {
    if (onDone == null) return
    val sinceStart = elapsed()
    Log.w(TAG, "stt error code=$code name=${SttErrors.name(code)} elapsedMs=$sinceStart attempt=${attempt.number}")
    when (val next = SttPolicy.next(code, sinceStart, attempt, LOCALES.size)) {
      is SttNext.GiveUp -> finish(null, next.reason)
      is SttNext.Retry -> {
        attempt = next.attempt
        destroyRecognizer()
        // Never restart from inside the recogniser's own callback.
        main.removeCallbacks(startAttempt)
        main.postDelayed(startAttempt, next.delayMs)
      }
    }
  }

  private fun finish(text: String?, reason: String) {
    val done = onDone ?: return
    onDone = null
    main.removeCallbacks(watchdog)
    main.removeCallbacks(startAttempt)
    destroyRecognizer()
    val transcript = text?.trim()?.takeIf { it.isNotEmpty() }
    val outcome = if (transcript != null) SttOutcome(transcript, "ok") else SttOutcome(null, reason)
    Log.i(TAG, "stt finish reason=${outcome.reason} elapsedMs=${elapsed()}")
    done(outcome)
  }

  private fun destroyRecognizer() {
    recognizer?.let {
      it.setRecognitionListener(null)
      try {
        it.cancel()
        it.destroy()
      } catch (_: RuntimeException) {
        // Already torn down by the system.
      }
    }
    recognizer = null
  }

  private val listener = object : RecognitionListener {
    override fun onResults(results: Bundle?) {
      finish(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull(), "no_speech")
    }

    override fun onError(error: Int) = handleError(error)

    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = onLevel(rmsdB)
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onPartialResults(partialResults: Bundle?) = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  private companion object {
    const val TAG = "ClovieVoice"
    val LOCALES = listOf("en-ZA", "en-US")

    /** Neither results nor an error within this long: cancel and let the service re-arm. */
    const val LISTEN_TIMEOUT_MS = 10_000L
    const val SILENCE_MS = 1_500L
  }
}
