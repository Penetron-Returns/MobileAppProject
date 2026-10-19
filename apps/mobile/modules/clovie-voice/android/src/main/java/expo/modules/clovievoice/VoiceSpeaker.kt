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
 * lazily (`warmUp` or the first `speak`) and is kept for the life of the service. A reply is split into
 * sentences ([SentenceSplitter]): the first is spoken at once and the rest are queued behind it, so speech starts
 * on the first sentence rather than after the whole reply is prepared. It asks for
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
  /** A reply that arrived while a filler was still speaking: it starts when the filler is done, never cutting it off. */
  private var following: Pending? = null
  private var focus: AudioFocusRequest? = null

  private class Pending(
    val text: String,
    val onDone: () -> Unit,
    val onStart: () -> Unit = {},
    val isInterim: Boolean = false,
  ) {
    val id: String = UUID.randomUUID().toString()
    val sentences: List<String> = SentenceSplitter.split(text).ifEmpty { listOf(text) }

    /** Index of the last sentence that was really queued; it ends the reply. */
    var lastIndex: Int = sentences.lastIndex

    fun utteranceId(index: Int) = "$id#$index"

    fun indexOf(utteranceId: String?): Int? =
      utteranceId?.takeIf { it.startsWith("$id#") }?.substringAfter('#')?.toIntOrNull()
  }

  /** Starts the engine early, so it is ready when the answer arrives. */
  fun warmUp() {
    if (engine != null || isFailed) return
    engine = TextToSpeech(context.applicationContext) { status -> main.post { onInit(status) } }
  }

  /** A short filler ("One sec, checking."): spoken at once; a later [speak] queues behind it. */
  fun speakInterim(text: String, onStart: () -> Unit = {}) {
    stop()
    val pending = Pending(text, {}, onStart, isInterim = true)
    if (isFailed) return
    if (!isReady) {
      queued = pending
      warmUp()
      return
    }
    start(pending)
  }

  /**
   * Speaks `text`, then calls `onDone` (also when speech is impossible, so callers never wait for nothing).
   * `onStart` runs when the engine really begins, so a watchdog can track the speech. Waits for a filler to end.
   */
  fun speak(text: String, onStart: () -> Unit = {}, onDone: () -> Unit) {
    val pending = Pending(text, onDone, onStart)
    if (current?.isInterim == true || queued?.isInterim == true) {
      following = pending
      return
    }
    stop()
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
    following = null
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
      following?.let(::finish)
      following = null
      return
    }
    chooseVoice(tts)
    tts.setAudioAttributes(VoiceAudio.attributes(AudioAttributes.CONTENT_TYPE_SPEECH))
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {
        // Only the first sentence starts the reply: the rest are queued behind it.
        main.post { current?.takeIf { it.indexOf(utteranceId) == 0 }?.onStart?.invoke() }
      }

      override fun onDone(utteranceId: String?) {
        main.post { complete(utteranceId) }
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) {
        main.post { fail(utteranceId) }
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
    if (tts.speak(pending.sentences[0], TextToSpeech.QUEUE_FLUSH, null, pending.utteranceId(0)) != TextToSpeech.SUCCESS) {
      current = null
      abandonFocus()
      return finish(pending)
    }
    for (index in 1..pending.sentences.lastIndex) {
      val queued = tts.speak(pending.sentences[index], TextToSpeech.QUEUE_ADD, null, pending.utteranceId(index))
      if (queued != TextToSpeech.SUCCESS) {
        pending.lastIndex = index - 1
        break
      }
    }
  }

  /** The last queued sentence ending ends the reply; earlier ones just let the next one play. */
  private fun complete(utteranceId: String?) {
    val pending = current ?: return
    val index = pending.indexOf(utteranceId) ?: return
    if (index < pending.lastIndex) return
    current = null
    abandonFocus()
    finish(pending)
  }

  /** A sentence failed: drop what is queued behind it and end the reply, so callers never wait for nothing. */
  private fun fail(utteranceId: String?) {
    val pending = current ?: return
    if (pending.indexOf(utteranceId) == null) return
    engine?.stop()
    current = null
    abandonFocus()
    finish(pending)
  }

  /** Reports the end of `pending`, then starts the reply that was waiting behind a filler. */
  private fun finish(pending: Pending) {
    pending.onDone()
    if (!pending.isInterim) return
    val next = following ?: return
    following = null
    if (isFailed) finish(next) else start(next)
  }

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
