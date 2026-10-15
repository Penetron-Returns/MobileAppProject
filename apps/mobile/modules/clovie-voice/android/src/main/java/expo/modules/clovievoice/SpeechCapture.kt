package expo.modules.clovievoice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * One spoken command through Android's own recogniser. On-device where the phone offers it
 * (API 31+), otherwise the default recogniser asked to prefer offline. South African English
 * first, then US English when the first is not installed. `SpeechRecognizer` is main-thread only.
 */
class SpeechCapture(private val context: Context, private val onLevel: (Float) -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var onDone: ((String?) -> Unit)? = null
  private var onStarted: (() -> Unit)? = null
  private var localeIndex = 0
  private val timeout = Runnable { finish(null) }

  /** Listens once; `onDone` gets the transcript, or null when nothing usable was heard. */
  fun listen(onStarted: () -> Unit, onDone: (String?) -> Unit) {
    cancel()
    this.onStarted = onStarted
    this.onDone = onDone
    localeIndex = 0
    main.postDelayed(timeout, LISTEN_TIMEOUT_MS)
    begin()
  }

  fun cancel() {
    onDone = null
    main.removeCallbacks(timeout)
    destroyRecognizer()
  }

  private fun begin() {
    destroyRecognizer()
    val created = create() ?: return finish(null)
    recognizer = created
    created.setRecognitionListener(listener)
    created.startListening(recognitionIntent(LOCALES[localeIndex]))
    onStarted?.invoke()
    onStarted = null
  }

  private fun create(): SpeechRecognizer? =
    when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context) ->
        SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      SpeechRecognizer.isRecognitionAvailable(context) -> SpeechRecognizer.createSpeechRecognizer(context)
      else -> null
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

  private fun finish(text: String?) {
    val done = onDone ?: return
    onDone = null
    main.removeCallbacks(timeout)
    destroyRecognizer()
    done(text?.trim()?.takeIf { it.isNotEmpty() })
  }

  private fun destroyRecognizer() {
    recognizer?.let {
      it.setRecognitionListener(null)
      it.cancel()
      it.destroy()
    }
    recognizer = null
  }

  private val listener = object : RecognitionListener {
    override fun onResults(results: Bundle?) {
      finish(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull())
    }

    override fun onError(error: Int) {
      val languageMissing = error == ERROR_LANGUAGE_NOT_SUPPORTED || error == ERROR_LANGUAGE_UNAVAILABLE
      if (languageMissing && localeIndex < LOCALES.lastIndex) {
        localeIndex++
        // Not from inside the recogniser's own callback.
        main.post { if (onDone != null) begin() }
      } else {
        finish(null)
      }
    }

    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = onLevel(rmsdB)
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onPartialResults(partialResults: Bundle?) = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  private companion object {
    val LOCALES = listOf("en-ZA", "en-US")
    // SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED / _UNAVAILABLE (API 31 constants).
    const val ERROR_LANGUAGE_NOT_SUPPORTED = 12
    const val ERROR_LANGUAGE_UNAVAILABLE = 13
    const val LISTEN_TIMEOUT_MS = 12_000L
    const val SILENCE_MS = 1_500L
  }
}
