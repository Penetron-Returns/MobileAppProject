package expo.modules.clovievoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID

/**
 * Reads a reply aloud with the phone's own text-to-speech engine: free and offline. The engine starts
 * lazily (`warmUp` or the first `speak`) and is kept for the life of the service. It asks for
 * transient audio focus, letting other audio duck, only while it talks. Message text is never logged,
 * because it can contain client names. All callbacks arrive on the main thread.
 */
class VoiceSpeaker(private val context: Context) {
  private val main = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(AudioManager::class.java)
  private var engine: TextToSpeech? = null
  private var isReady = false
  private var isFailed = false
  private var queued: Pending? = null
  private var current: Pending? = null
  private var focus: AudioFocusRequest? = null

  private class Pending(val text: String, val onDone: () -> Unit) {
    val id: String = UUID.randomUUID().toString()
  }

  /** Starts the engine early, so it is ready when the answer arrives. */
  fun warmUp() {
    if (engine != null || isFailed) return
    engine = TextToSpeech(context.applicationContext) { status -> main.post { onInit(status) } }
  }

  /** Speaks `text`, then calls `onDone` (also when speech is impossible, so callers never wait for nothing). */
  fun speak(text: String, onDone: () -> Unit) {
    stop()
    val pending = Pending(text, onDone)
    if (isFailed) return finish(pending)
    if (!isReady) {
      queued = pending
      warmUp()
      return
    }
    start(pending)
  }

  /** Cuts speech off; the pending `onDone` is dropped. */
  fun stop() {
    queued = null
    current = null
    engine?.stop()
    abandonFocus()
  }

  fun shutdown() {
    stop()
    engine?.shutdown()
    engine = null
    isReady = false
  }

  private fun onInit(status: Int) {
    val tts = engine ?: return
    if (status != TextToSpeech.SUCCESS) {
      isFailed = true
      engine = null
      queued?.let(::finish)
      queued = null
      return
    }
    chooseVoice(tts)
    tts.setAudioAttributes(VoiceAudio.attributes(AudioAttributes.CONTENT_TYPE_SPEECH))
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) = Unit

      override fun onDone(utteranceId: String?) {
        main.post { complete(utteranceId) }
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) {
        main.post { complete(utteranceId) }
      }

      override fun onStop(utteranceId: String?, interrupted: Boolean) = Unit
    })
    isReady = true
    queued?.let(::start)
    queued = null
  }

  /** English (South Africa), else en-GB, else whatever the phone defaults to. */
  private fun chooseVoice(tts: TextToSpeech) {
    val locale = SpeechLocalePolicy.pick { tts.isLanguageAvailable(it) >= TextToSpeech.LANG_AVAILABLE }
    if (locale != null) tts.language = locale
  }

  private fun start(pending: Pending) {
    val tts = engine ?: return finish(pending)
    if (!VoiceAudio.isAudible(context)) return finish(pending)
    current = pending
    requestFocus()
    if (tts.speak(pending.text, TextToSpeech.QUEUE_FLUSH, null, pending.id) != TextToSpeech.SUCCESS) {
      current = null
      abandonFocus()
      finish(pending)
    }
  }

  private fun complete(utteranceId: String?) {
    val pending = current?.takeIf { it.id == utteranceId } ?: return
    current = null
    abandonFocus()
    finish(pending)
  }

  private fun finish(pending: Pending) = pending.onDone()

  private fun requestFocus() {
    val manager = audio ?: return
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(VoiceAudio.attributes(AudioAttributes.CONTENT_TYPE_SPEECH))
      .build()
    focus = request
    manager.requestAudioFocus(request)
  }

  private fun abandonFocus() {
    val request = focus ?: return
    audio?.abandonAudioFocusRequest(request)
    focus = null
  }
}
