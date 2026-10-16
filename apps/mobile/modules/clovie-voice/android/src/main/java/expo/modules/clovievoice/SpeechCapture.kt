package expo.modules.clovievoice

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi

/** The end of one listen: `text` is the transcript, or null with `reason` (`no_speech`, `permission`, `language`, `error`, `timeout`, `unavailable`). */
data class SttOutcome(val text: String?, val reason: String)

/**
 * One spoken command through Android's own recogniser. The attempts run in `SttPolicy.ORDER`:
 * on-device with the chosen language, the default recogniser with it, the default recogniser with
 * no language at all (Samsung's service often rejects explicit locales), then Google's recogniser
 * by component. On API 33+ the language is chosen from `checkRecognitionSupport` (en-ZA, en-GB,
 * en-US, any en-*). Errors are logged by code and name (never text). A watchdog ends the listen if
 * nothing arrives in time. `SpeechRecognizer` is main-thread only.
 */
class SpeechCapture(
  private val context: Context,
  private val onModelDownload: () -> Unit = {},
  private val onLevel: (Float) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var onDone: ((SttOutcome) -> Unit)? = null

  /** True while a command is being listened for. */
  val isBusy: Boolean
    get() = onDone != null
  private var onStarted: (() -> Unit)? = null
  private var attempt = SttAttempt(SttStep.ON_DEVICE)
  private var startedAt = 0L
  private var hasTriggeredDownload = false
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
    attempt = SttAttempt(SttStep.ON_DEVICE)
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
    val step = attempt.step
    val created = create(step) ?: return advance(SttPolicy.skip(attempt))
    recognizer = created
    created.setRecognitionListener(listener)
    if (!step.hasLocale) return start(created, null)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return start(created, FALLBACK_LOCALE)
    chooseLanguage(created, step)
  }

  /** Learns what the recogniser supports (API 33+), picks the language, then starts. */
  @RequiresApi(33)
  private fun chooseLanguage(created: SpeechRecognizer, step: SttStep) {
    val callback = object : RecognitionSupportCallback {
      override fun onSupportResult(support: RecognitionSupport) {
        if (recognizer !== created || onDone == null) return
        val installed = support.installedOnDeviceLanguages.toList()
        val online = support.onlineLanguages.toList()
        val supported = support.supportedOnDeviceLanguages.toList()
        val pending = support.pendingOnDeviceLanguages.toList()
        val pool = if (step.useOnDevice) installed else installed + online
        val chosen = SttLanguages.choose(pool) ?: if (step.useOnDevice) null else SttLanguages.choose(supported)
        Log.i(
          TAG,
          "stt languages step=$step installed=$installed online=${online.size} pending=$pending " +
            "supported=${supported.size} chosen=$chosen",
        )
        if (step.useOnDevice && chosen == null) maybeDownload(created, supported, pending)
        if (chosen == null) advance(SttPolicy.skip(attempt)) else start(created, chosen)
      }

      override fun onError(error: Int) {
        if (recognizer !== created || onDone == null) return
        Log.w(TAG, "stt languages check failed code=$error step=$step")
        start(created, FALLBACK_LOCALE)
      }
    }
    try {
      created.checkRecognitionSupport(recognitionIntent(null, false), context.mainExecutor, callback)
    } catch (e: RuntimeException) {
      Log.w(TAG, "stt languages check threw ${e.javaClass.simpleName}")
      start(created, FALLBACK_LOCALE)
    }
  }

  /** An English model that is downloadable but not installed: ask for it once, tell the owner quietly. */
  @RequiresApi(33)
  private fun maybeDownload(created: SpeechRecognizer, supported: List<String>, pending: List<String>) {
    if (hasTriggeredDownload || SttLanguages.choose(pending) != null) return
    val language = SttLanguages.choose(supported) ?: return
    hasTriggeredDownload = true
    try {
      created.triggerModelDownload(recognitionIntent(language, true))
      Log.i(TAG, "stt model download triggered language=$language")
      onModelDownload()
    } catch (e: RuntimeException) {
      Log.w(TAG, "stt model download threw ${e.javaClass.simpleName}")
    }
  }

  private fun start(created: SpeechRecognizer, locale: String?) {
    val step = attempt.step
    try {
      created.startListening(recognitionIntent(locale, step.useOnDevice))
    } catch (e: RuntimeException) {
      Log.w(TAG, "stt startListening threw ${e.javaClass.simpleName}")
      return handleError(SttErrors.CLIENT)
    }
    Log.i(TAG, "stt start attempt=${attempt.number} step=$step locale=${locale ?: "device"}")
    onStarted?.invoke()
    onStarted = null
  }

  /** The recogniser for `step`; null when it cannot exist here (no on-device model, no Google service). */
  private fun create(step: SttStep): SpeechRecognizer? {
    try {
      if (step.useOnDevice) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
          return null
        }
        return SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      }
      if (step.isGoogle) return googleService()?.let { SpeechRecognizer.createSpeechRecognizer(context, it) }
      return if (SpeechRecognizer.isRecognitionAvailable(context)) SpeechRecognizer.createSpeechRecognizer(context) else null
    } catch (e: RuntimeException) {
      Log.w(TAG, "stt create threw step=$step ${e.javaClass.simpleName}")
      return null
    }
  }

  /** Google's recognition service, when installed and not already the phone's default one. */
  private fun googleService(): ComponentName? {
    val services = context.packageManager.queryIntentServices(Intent(RecognitionService.SERVICE_INTERFACE), 0)
    val found = services.mapNotNull { it.serviceInfo }.firstOrNull { it.packageName in GOOGLE_PACKAGES } ?: return null
    val defaultPackage = try {
      Settings.Secure.getString(context.contentResolver, "voice_recognition_service")
        ?.let(ComponentName::unflattenFromString)?.packageName
    } catch (_: RuntimeException) {
      null
    }
    if (defaultPackage == found.packageName) return null
    return ComponentName(found.packageName, found.name)
  }

  /** `locale` null sends no language extras at all, so the recogniser uses the phone's own language. */
  private fun recognitionIntent(locale: String?, preferOffline: Boolean) =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      if (locale != null) {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, locale)
      }
      if (preferOffline) putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
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
    advance(SttPolicy.next(code, sinceStart, attempt))
  }

  private fun advance(next: SttNext) {
    when (next) {
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
    const val FALLBACK_LOCALE = "en-ZA"
    val GOOGLE_PACKAGES = setOf("com.google.android.googlequicksearchbox", "com.google.android.as")

    /** Neither results nor an error within this long: cancel and let the service re-arm. */
    const val LISTEN_TIMEOUT_MS = 10_000L
    const val SILENCE_MS = 1_500L
  }
}
