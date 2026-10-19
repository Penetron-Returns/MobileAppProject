package expo.modules.clovievoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale
import java.util.UUID

/**
 * Reads a reply aloud, free and offline. The preferred voice is the on-device neural one ([KokoroEngine]), used once
 * its model is downloaded and loaded; otherwise, or if it ever fails, the phone's own text-to-speech engine speaks,
 * so the owner never hears silence. Engines start lazily (`warmUp` or the first `speak`) and are kept for the life
 * of the service. A reply is split into sentences ([SentenceSplitter]): the first is spoken at once and the rest are
 * queued behind it, so speech starts on the first sentence rather than after the whole reply is prepared. It asks for
 * transient audio focus, letting other audio duck, only while it talks. Message text is never logged,
 * because it can contain client names. All callbacks arrive on the main thread.
 */
class VoiceSpeaker(private val context: Context) {
  private val main = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(AudioManager::class.java)
  private val events = EngineEvents()
  private var engine: TextToSpeech? = null
  private var system: SystemSpeechEngine? = null
  private val neural = KokoroEngine(context.applicationContext, events)
  private var isReady = false
  private var isFailed = false
  /** Consecutive neural failures; two in a row park the neural voice until the next session. */
  private var neuralFailures = 0
  /** True while the engine in use was requested by package name; its init failure gets one retry on the default engine. */
  private var isUsingGoogleEngine = false
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

    /** The engine speaking this reply, so a failure knows whether to fall back. */
    var engine: SpeechEngine? = null

    /** Index of the last sentence that was really queued; it ends the reply. */
    var lastIndex: Int = sentences.lastIndex

    fun utteranceId(index: Int) = "$id#$index"

    fun indexOf(utteranceId: String?): Int? =
      utteranceId?.takeIf { it.startsWith("$id#") }?.substringAfter('#')?.toIntOrNull()
  }

  /** Both engines report here, always on the main thread. */
  private inner class EngineEvents : SpeechEngineListener {
    override fun onStart(utteranceId: String) {
      // Only the first sentence starts the reply: the rest are queued behind it.
      current?.takeIf { it.indexOf(utteranceId) == 0 }?.onStart?.invoke()
    }

    override fun onDone(utteranceId: String) {
      if (current?.engine === neural) neuralFailures = 0
      complete(utteranceId)
    }

    override fun onError(utteranceId: String) {
      fail(utteranceId)
    }
  }

  /** Starts the engines early, so they are ready when the answer arrives. */
  fun warmUp() {
    neural.load()
    if (engine != null || isFailed) return
    val listener = TextToSpeech.OnInitListener { status -> main.post { onInit(status) } }
    val app = context.applicationContext
    isUsingGoogleEngine = isGoogleEngineInstalled()
    engine = if (isUsingGoogleEngine) TextToSpeech(app, listener, GOOGLE_TTS_PACKAGE) else TextToSpeech(app, listener)
  }

  /** Google's engine usually has the most natural voices; visible via the TTS_SERVICE <queries> entry. */
  private fun isGoogleEngineInstalled(): Boolean = try {
    context.packageManager.getPackageInfo(GOOGLE_TTS_PACKAGE, 0)
    true
  } catch (_: Exception) {
    false
  }

  private fun choose(): EngineChoice = NeuralVoicePolicy.choose(
    isNeuralLoaded = neural.isLoaded,
    isNeuralBroken = neuralFailures >= MAX_NEURAL_FAILURES,
    isSystemReady = isReady,
    isSystemFailed = isFailed,
  )

  /** A short filler ("One sec, checking."): spoken at once; a later [speak] queues behind it. */
  fun speakInterim(text: String, onStart: () -> Unit = {}) {
    stop()
    begin(Pending(text, {}, onStart, isInterim = true), finishWhenImpossible = false)
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
    begin(pending, finishWhenImpossible = true)
  }

  private fun begin(pending: Pending, finishWhenImpossible: Boolean) {
    when (choose()) {
      EngineChoice.NONE -> if (finishWhenImpossible) finish(pending)
      EngineChoice.WAIT -> {
        queued = pending
        warmUp()
      }
      else -> start(pending)
    }
  }

  /** Cuts speech off; the pending `onDone` is dropped. */
  fun stop() {
    queued = null
    following = null
    current = null
    system?.stop()
    neural.stop()
    abandonFocus()
  }

  /** Low memory: frees the neural model; it reloads on the next `warmUp`. */
  fun trimMemory() {
    neural.release()
  }

  fun shutdown() {
    stop()
    neural.release()
    engine?.shutdown()
    engine = null
    system = null
    isReady = false
  }

  private fun onInit(status: Int) {
    val tts = engine ?: return
    if (status != TextToSpeech.SUCCESS) {
      if (isUsingGoogleEngine) {
        // Never leave the owner in silence: retry once with the phone's default engine.
        isUsingGoogleEngine = false
        engine?.shutdown()
        val listener = TextToSpeech.OnInitListener { s -> main.post { onInit(s) } }
        engine = TextToSpeech(context.applicationContext, listener)
        return
      }
      isFailed = true
      engine = null
      system = null
      val waiting = queued
      val next = following
      queued = null
      following = null
      // The neural voice may still be able to speak what was waiting; otherwise end it so callers never wait.
      if (waiting != null) if (choose() == EngineChoice.NEURAL) start(waiting) else finish(waiting)
      if (next != null) finish(next)
      return
    }
    chooseVoice(tts)
    tts.setAudioAttributes(VoiceAudio.attributes(AudioAttributes.CONTENT_TYPE_SPEECH))
    system = SystemSpeechEngine(tts, events)
    isReady = true
    queued?.let(::start)
    queued = null
  }

  /** English (South Africa), else en-GB, else whatever the phone defaults to. */
  private fun chooseVoice(tts: TextToSpeech) {
    val locale = SpeechLocalePolicy.pick { tts.isLanguageAvailable(it) >= TextToSpeech.LANG_AVAILABLE }
    if (locale != null) tts.language = locale
    val voices = try { tts.voices.orEmpty() } catch (_: Exception) { emptySet() }
    val candidates = voices.map {
      VoiceCandidate(it.name, it.locale, it.quality, it.latency, it.isNetworkConnectionRequired, it.features.orEmpty())
    }
    val best = VoiceRanking.pick(candidates, locale ?: Locale.getDefault())
    val chosen = voices.firstOrNull { it.name == best?.name }
    if (chosen != null) tts.voice = chosen
    tts.setSpeechRate(SPEECH_RATE)
    tts.setPitch(PITCH)
    // Engine and voice names only; never any message text.
    Log.i(TAG, "tts engine=${tts.defaultEngine} voice=${chosen?.name ?: "default"} rate=$SPEECH_RATE pitch=$PITCH")
  }

  /** Speaks the reply from its first sentence on whichever engine [choose] picks. */
  private fun start(pending: Pending) {
    val picked = when (choose()) {
      EngineChoice.NEURAL -> neural
      EngineChoice.SYSTEM -> system
      else -> null
    } ?: return finish(pending)
    if (!VoiceAudio.isAudible(context)) return finish(pending)
    current = pending
    requestFocus()
    if (!speakFrom(pending, 0, picked)) {
      // The neural voice refused the first sentence: the system voice takes over before anything was heard.
      if (picked === neural && fallBackToSystem(pending, 0)) return
      current = null
      abandonFocus()
      finish(pending)
    }
  }

  /** Queues sentences `from`..end on `picked`; the first flushes, so nothing older is heard. False if the first is refused. */
  private fun speakFrom(pending: Pending, from: Int, picked: SpeechEngine): Boolean {
    pending.engine = picked
    if (!picked.speak(pending.sentences[from], pending.utteranceId(from), flush = true)) return false
    for (index in from + 1..pending.sentences.lastIndex) {
      if (!picked.speak(pending.sentences[index], pending.utteranceId(index), flush = false)) {
        pending.lastIndex = index - 1
        break
      }
    }
    return true
  }

  /** Hands the rest of the reply (from sentence `index`) to the system voice. False when it cannot speak. */
  private fun fallBackToSystem(pending: Pending, index: Int): Boolean {
    neuralFailures++
    Log.w(TAG, "neural voice failed; using system voice failures=$neuralFailures")
    neural.stop()
    val fallback = system?.takeIf { isReady } ?: return false
    pending.lastIndex = pending.sentences.lastIndex
    return speakFrom(pending, index, fallback)
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

  /** A sentence failed: the neural voice hands the rest to the system voice; otherwise the reply ends. */
  private fun fail(utteranceId: String?) {
    val pending = current ?: return
    val index = pending.indexOf(utteranceId) ?: return
    if (pending.engine === neural && fallBackToSystem(pending, index)) return
    system?.stop()
    neural.stop()
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
    if (choose() == EngineChoice.NONE) finish(next) else start(next)
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

  private companion object {
    const val TAG = "ClovieVoice"
    const val GOOGLE_TTS_PACKAGE = "com.google.android.tts"
    const val MAX_NEURAL_FAILURES = 2

    /** Slightly brisker than 1.0 so replies sound alive; kept small so speech stays clear. */
    const val SPEECH_RATE = 1.05f
    const val PITCH = 1.0f
  }
}
