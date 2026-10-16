package expo.modules.clovievoice

import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Where one voice interaction is shown: the system overlay ([VoiceOverlay], over every app) or the companion
 * drawer inside the app ([AppVoiceSurface], which only emits events for JS to draw). The service captures, transcribes,
 * speaks and follows up exactly the same way for both; only this seam differs.
 */
interface VoiceSurface {
  /** How long `hide` takes to finish before the interaction may end. */
  val exitMs: Long

  /** Makes the surface visible. False when it cannot be shown (no "Display over other apps"). */
  fun show(): Boolean
  fun hide(animated: Boolean = true)
  fun setState(state: String)
  fun setTranscript(text: String)
  fun setMessage(text: String)
  fun setAction(label: String?)
  fun pushRms(rmsDb: Float)
  fun pushLevel(level: Float)

  /** The finished command, with everything the drawer needs to draw the answer and its approval. No-op for the overlay. */
  fun onOutcome(outcome: CommandOutcome) {}

  /** Nothing is being captured or spoken, but an approval still waits for a tap or a yes or no. No-op for the overlay. */
  fun setWaiting() {}
}

enum class SurfaceKind { OVERLAY, IN_APP }

/** Pure choice of surface for a wake: the in-app drawer only when someone is looking at the app and JS can draw it. */
object VoiceRouting {
  fun surfaceFor(isAppForeground: Boolean, isUiAttached: Boolean): SurfaceKind =
    if (isAppForeground && isUiAttached) SurfaceKind.IN_APP else SurfaceKind.OVERLAY

  /** The UI state JS sees for an overlay state name; null for a state the drawer does not draw. */
  fun uiStateFor(overlayState: String): String? = when (overlayState) {
    "listening" -> "listening"
    "processing" -> "thinking"
    "done", "error", "request" -> "speaking"
    else -> null
  }
}

/**
 * Whether the app is on screen and whether its JS has a voice drawer mounted. Both are written by the module (JS
 * reports AppState, the Expo activity callbacks report resume and pause; the last write wins) and read by the
 * service. A process that was started by the tile or the wake word with no UI has neither, so the overlay is used.
 */
object AppPresence {
  @Volatile
  var isForeground = false
    private set

  @Volatile
  var isUiAttached = false
    private set

  fun setForeground(value: Boolean) {
    isForeground = value
  }

  fun setUiAttached(value: Boolean) {
    isUiAttached = value
  }
}

/** Receives what the in-app surface emits; the module forwards it to JS as events. */
interface VoiceUiListener {
  fun onVoiceState(state: String, level: Float?)
  fun onVoiceTranscript(text: String)
  fun onVoiceOutcome(outcome: CommandOutcome)
}

object VoiceUiBus {
  private val listeners = CopyOnWriteArraySet<VoiceUiListener>()

  fun add(listener: VoiceUiListener) {
    listeners.add(listener)
  }

  fun remove(listener: VoiceUiListener) {
    listeners.remove(listener)
  }

  fun state(state: String, level: Float? = null) = listeners.forEach { it.onVoiceState(state, level) }
  fun transcript(text: String) = listeners.forEach { it.onVoiceTranscript(text) }
  fun outcome(outcome: CommandOutcome) = listeners.forEach { it.onVoiceOutcome(outcome) }
}

/**
 * The in-app surface: no window, only events. States go out when they change; the microphone level goes out at
 * ~15 Hz and only while listening, so a still screen costs nothing. The partial transcript is not faked: the cloud
 * path transcribes after the clip, so the words arrive once, as the transcript of the thinking state.
 */
class AppVoiceSurface : VoiceSurface {
  private val main = Handler(Looper.getMainLooper())
  private val meter = LevelMeter()
  private var isMetering = false

  override val exitMs = 0L

  override fun show(): Boolean = true

  override fun hide(animated: Boolean) {
    stopMetering()
    VoiceUiBus.state("idle")
  }

  override fun setState(state: String) {
    val ui = VoiceRouting.uiStateFor(state) ?: return
    if (ui == "listening") startMetering() else stopMetering()
    VoiceUiBus.state(ui)
  }

  override fun setTranscript(text: String) = VoiceUiBus.transcript(text)

  override fun setMessage(text: String) = Unit

  override fun setAction(label: String?) = Unit

  override fun pushRms(rmsDb: Float) = meter.push(rmsDb)

  override fun pushLevel(level: Float) = meter.pushLevel(level)

  override fun onOutcome(outcome: CommandOutcome) = VoiceUiBus.outcome(outcome)

  override fun setWaiting() {
    stopMetering()
    VoiceUiBus.state("waiting")
  }

  private val tick = object : Runnable {
    override fun run() {
      if (!isMetering) return
      VoiceUiBus.state("listening", meter.next())
      main.postDelayed(this, FRAME_MS)
    }
  }

  private fun startMetering() {
    if (isMetering) return
    isMetering = true
    meter.reset()
    main.post(tick)
  }

  private fun stopMetering() {
    isMetering = false
    main.removeCallbacks(tick)
  }

  companion object {
    /** ~15 Hz: enough for a waveform, a quarter of the work of the overlay's 30 Hz. */
    const val FRAME_MS = 66L
  }
}
