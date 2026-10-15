package expo.modules.clovievoice

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.util.concurrent.Executors

/**
 * The foreground service (type `microphone`) behind "Hey Clovie". It keeps the wake-word
 * listener running with the app in the background or the phone locked. On a detection it shows
 * the overlay window (the voice UI), plays an earcon, captures one spoken command, and hands the
 * transcript to the app's JS (a headless task) to run. The outcome appears in the overlay, or in a
 * notification when "Display over other apps" is not granted.
 *
 * Android 12+ refuses to start a foreground service from the background, so `ClovieVoiceModule.start`
 * is only called while the app is on screen. Android 10+ also refuses to start an activity from the
 * background, so the app is only opened by a tap (overlay button or notification). All state
 * changes happen on the main thread.
 */
class VoiceService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val loader = Executors.newSingleThreadExecutor()
  private lateinit var config: VoiceConfig
  private lateinit var notifications: VoiceNotifications
  private lateinit var speech: SpeechCapture
  private lateinit var overlay: VoiceOverlay
  private var gate = WakeWordGate()
  private var engine: WakeWordEngine? = null
  private var listener: WakeWordListener? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var hasOverlay = false
  private var lastTranscript = ""
  private var isDestroyed = false
  private val dismiss = Runnable { overlay.hide() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    config = VoiceConfig.read(this)
    notifications = VoiceNotifications(this, config)
    overlay = VoiceOverlay(this, ::onOverlayAction)
    speech = SpeechCapture(this) { overlay.pushRms(it) }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_START) {
      begin(intent)
    } else {
      // Stop action, or a stale restart: nothing to run.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun begin(intent: Intent) {
    if (!enterForeground()) return
    VoiceState.update(VoiceStatus.STARTING)
    gate = WakeWordGate(threshold = intent.getFloatExtra(EXTRA_THRESHOLD, WakeWordGate.DEFAULT_THRESHOLD))
    val classifier = intent.getStringExtra(EXTRA_CLASSIFIER)?.takeIf { it.isNotBlank() } ?: config.classifier
    acquireWakeLock()
    overlay.preload()
    // Loading three ONNX models takes a moment: not on the main thread.
    loader.execute {
      val loaded = try {
        WakeWordEngine.load(applicationContext, classifier)
      } catch (_: Exception) {
        null
      }
      main.post {
        if (isDestroyed) {
          loaded?.close()
        } else if (loaded == null) {
          fail(VoiceError.MODEL_LOAD_FAILED)
        } else {
          engine = loaded
          startListening()
        }
      }
    }
  }

  private fun enterForeground(): Boolean {
    notifications.createChannels()
    val notification = notifications.listening()
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          VoiceNotifications.LISTENING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
        )
      } else {
        startForeground(VoiceNotifications.LISTENING_NOTIFICATION_ID, notification)
      }
      true
    } catch (e: Exception) {
      // SecurityException: no RECORD_AUDIO. Anything else (ForegroundServiceStartNotAllowedException): started from the background.
      fail(if (e is SecurityException) VoiceError.PERMISSION_DENIED else VoiceError.BACKGROUND_START_BLOCKED)
      false
    }
  }

  private fun startListening() {
    val current = engine ?: return
    listener = WakeWordListener(current, gate, onWake = ::onWake, onError = ::fail).also { it.start() }
    VoiceState.update(VoiceStatus.LISTENING)
  }

  /** The listener has already released the microphone. */
  private fun onWake() {
    if (isDestroyed) return
    VoiceTimings.wake()
    VoiceState.update(VoiceStatus.BUSY)
    listener = null
    main.removeCallbacks(dismiss)
    hasOverlay = overlay.show()
    if (hasOverlay) {
      overlay.setAction(null)
      overlay.setMessage("")
      overlay.setTranscript("")
      overlay.setState("listening")
      VoiceTimings.overlayShown()
    }
    playEarcon()
    // Let the earcon finish so the recogniser does not transcribe it.
    main.postDelayed({
      if (!isDestroyed) speech.listen(onStarted = VoiceTimings::sttStarted, onDone = ::onTranscript)
    }, EARCON_MS)
  }

  private fun onTranscript(text: String?) {
    if (isDestroyed) return
    VoiceTimings.sttFinished()
    startListening() // the wake word is live again while the command runs
    if (text == null) {
      showOutcome(CommandOutcome("error", NOT_HEARD))
      return
    }
    lastTranscript = text
    if (hasOverlay) {
      overlay.setTranscript(text)
      overlay.setState("processing")
    }
    VoiceTimings.commandStarted()
    val id = VoiceCommandBridge.register(::showOutcome)
    try {
      startService(
        Intent(this, VoiceCommandTaskService::class.java)
          .putExtra(VoiceCommandTaskService.EXTRA_ID, id)
          .putExtra(VoiceCommandTaskService.EXTRA_TRANSCRIPT, text),
      )
    } catch (_: Exception) {
      VoiceCommandBridge.complete(id, CommandOutcome("open_app", ""))
    }
  }

  private fun showOutcome(outcome: CommandOutcome) {
    if (isDestroyed) return
    VoiceTimings.commandDone()
    val isFinished = outcome.status == "done" || outcome.status == "error"
    if (hasOverlay) {
      if (isFinished) {
        overlay.setMessage(if (outcome.message == NOT_HEARD) "" else outcome.message)
        overlay.setState(outcome.status)
        main.postDelayed(dismiss, RESULT_MS)
      } else {
        // JS could not finish it (or did not answer): the owner taps to continue in the app.
        overlay.setMessage("")
        overlay.setState("request")
        overlay.setAction(OPEN_LABEL)
        main.postDelayed(dismiss, OPEN_MS)
      }
    } else if (isFinished) {
      notifications.result("Clovie", outcome.message, null)
    } else {
      notifications.result("Clovie heard you", lastTranscript, lastTranscript)
    }
  }

  /** A tap on the overlay's button: a user gesture, so Android lets it open the app. */
  private fun onOverlayAction() {
    main.removeCallbacks(dismiss)
    try {
      startActivity(notifications.deepLink(lastTranscript))
    } catch (_: Exception) {
      // Nothing to open; the overlay still closes.
    }
    overlay.hide()
  }

  private fun playEarcon() {
    try {
      val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70)
      tone.startTone(ToneGenerator.TONE_PROP_ACK, 150)
      main.postDelayed({ tone.release() }, EARCON_MS)
    } catch (_: RuntimeException) {
      // No audio output; carry on silently.
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    // Released in cleanup(); a timeout would silently end listening.
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "clovie:voice").apply { acquire() }
  }

  private fun fail(reason: String) {
    VoiceState.update(VoiceStatus.ERROR, reason)
    cleanup()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun cleanup() {
    speech.cancel()
    main.removeCallbacksAndMessages(null)
    VoiceCommandBridge.cancelAll()
    overlay.destroy()
    listener?.stop()
    listener = null
    engine?.close()
    engine = null
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
  }

  override fun onDestroy() {
    isDestroyed = true
    cleanup()
    loader.shutdown()
    if (VoiceState.snapshot.status != VoiceStatus.ERROR) VoiceState.update(VoiceStatus.OFF)
    super.onDestroy()
  }

  companion object {
    const val ACTION_START = "expo.modules.clovievoice.START"
    const val ACTION_STOP = "expo.modules.clovievoice.STOP"
    const val EXTRA_CLASSIFIER = "classifier"
    const val EXTRA_THRESHOLD = "threshold"
    private const val EARCON_MS = 350L
    private const val RESULT_MS = 2_000L
    private const val OPEN_MS = 10_000L
    private const val NOT_HEARD = "Didn't catch that"
    private const val OPEN_LABEL = "Open Clovie"
  }
}
