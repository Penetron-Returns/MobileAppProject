package expo.modules.clovievoice

import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener

/** The phone's own text-to-speech as a [SpeechEngine]. The caller configures the voice; this only speaks. */
class SystemSpeechEngine(
  private val tts: TextToSpeech,
  private val listener: SpeechEngineListener,
) : SpeechEngine {
  private val main = Handler(Looper.getMainLooper())

  init {
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {
        utteranceId?.let { id -> main.post { listener.onStart(id) } }
      }

      override fun onDone(utteranceId: String?) {
        utteranceId?.let { id -> main.post { listener.onDone(id) } }
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) {
        utteranceId?.let { id -> main.post { listener.onError(id) } }
      }

      override fun onStop(utteranceId: String?, interrupted: Boolean) = Unit
    })
  }

  override fun speak(text: String, utteranceId: String, flush: Boolean): Boolean {
    val mode = if (flush) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
    return tts.speak(text, mode, null, utteranceId) == TextToSpeech.SUCCESS
  }

  override fun stop() {
    tts.stop()
  }
}
