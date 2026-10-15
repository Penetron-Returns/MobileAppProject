package expo.modules.clovievoice

import android.app.Notification
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * The foreground service (type `microphone`) behind "Clovie voice", in two modes that share one
 * interaction: overlay with the cinematic entrance, one spoken command through Android's recogniser,
 * the app's headless JS task to run it, and the outcome in the overlay (or a notification without
 * "Display over other apps").
 *
 *  - One-tap ("Talk to Clovie", ACTION_TALK): started by the tile, widget, shortcut or side key. No
 *    wake word. It lives for one interaction and stops itself when the overlay has gone.
 *  - Hands-free (ACTION_START): the wake-word listener runs, but only inside the owner's conditions
 *    (opening hours, charger, pause). Outside them the microphone is closed completely, the wake lock
 *    is released and the notification says when it comes back; an alarm and a power receiver re-arm it.
 *
 * Android 12+ refuses to start a microphone foreground service from the background, so every start
 * comes from an activity (VoiceTalkActivity) or the foreground app. Android 10+ also refuses to start
 * an activity from the background, so the app only opens on a tap. State changes happen on the main thread.
 */
class VoiceService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val loader = Executors.newSingleThreadExecutor()
  private lateinit var config: VoiceConfig
  private lateinit var policy: HandsFreePolicy
  private lateinit var notifications: VoiceNotifications
  private lateinit var speech: SpeechCapture
  private lateinit var overlay: VoiceOverlay
  private lateinit var feedback: VoiceFeedback
  private var gate = WakeWordGate()
  private var classifier: String? = null
  private var engine: WakeWordEngine? = null
  private var isLoadingEngine = false
  private var listener: WakeWordListener? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var powerReceiver: BroadcastReceiver? = null
  private var isHandsFree = false
  private var isOneShot = false
  private var hasOverlay = false
  private var lastTranscript = ""
  private var isDestroyed = false
  private val dismiss = Runnable {
    overlay.hide()
    if (isOneShot) main.postDelayed({ shutdown() }, VoiceOverlay.EXIT_MS + 60)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    config = VoiceConfig.read(this)
    policy = HandsFreePolicy(this)
    notifications = VoiceNotifications(this, config)
    overlay = VoiceOverlay(this, ::onOverlayAction)
    feedback = VoiceFeedback(this)
    speech = SpeechCapture(this) { overlay.pushRms(it) }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> beginHandsFree(intent)
      ACTION_TALK -> beginTalk()
      ACTION_REEVALUATE -> if (isHandsFree) reevaluate() else stopSelf()
      ACTION_PAUSE -> {
        policy.pausedUntil = System.currentTimeMillis() + PAUSE_MS
        if (isHandsFree) reevaluate() else stopSelf()
      }
      ACTION_STOP -> {
        policy.isEnabled = false
        HandsFreeController.cancel(this)
        shutdown()
      }
      else -> stopSelf() // a stale restart: nothing to run
    }
    return START_NOT_STICKY
  }

  // ---- hands-free ----

  private fun beginHandsFree(intent: Intent) {
    policy.isEnabled = true
    if (!enterForeground(currentNotification())) return
    isHandsFree = true
    notifications.clearReady()
    VoiceState.update(VoiceStatus.STARTING)
    gate = WakeWordGate(threshold = intent.getFloatExtra(EXTRA_THRESHOLD, WakeWordGate.DEFAULT_THRESHOLD))
    classifier = intent.getStringExtra(EXTRA_CLASSIFIER)?.takeIf { it.isNotBlank() } ?: config.classifier
    overlay.preload()
    registerPowerReceiver()
    reevaluate()
  }

  /** Opens or closes the microphone for the current conditions and schedules the next change. */
  private fun reevaluate() {
    if (!isHandsFree || isDestroyed) return
    val now = System.currentTimeMillis()
    val duty = policy.evaluate(now, HandsFreeController.isCharging(this))
    HandsFreeController.schedule(this, policy, now)
    notifications.update(notifications.handsFree(duty, policy, now))
    when {
      speech.isBusy -> Unit // an interaction is running; it re-checks when it ends
      duty.state == DutyState.ON_DUTY -> ensureListening()
      duty.state == DutyState.STOPPED -> shutdown()
      else -> standBy()
    }
  }

  private fun ensureListening() {
    if (listener != null) return
    acquireWakeLock()
    val loaded = engine
    if (loaded != null) {
      startListening()
      return
    }
    if (isLoadingEngine) return
    isLoadingEngine = true
    val spec = classifier ?: config.classifier
    // Loading three ONNX models takes a moment: not on the main thread.
    loader.execute {
      val created = try {
        WakeWordEngine.load(applicationContext, spec)
      } catch (_: Exception) {
        null
      }
      main.post {
        isLoadingEngine = false
        when {
          isDestroyed -> created?.close()
          created == null -> fail(VoiceError.MODEL_LOAD_FAILED)
          else -> {
            engine = created
            reevaluate()
          }
        }
      }
    }
  }

  /** Outside the conditions: no recording at all (no microphone indicator), no wake lock. */
  private fun standBy() {
    listener?.stop()
    listener = null
    engine?.close()
    engine = null
    releaseWakeLock()
    VoiceState.update(VoiceStatus.STANDBY)
  }

  private fun startListening() {
    val current = engine ?: return
    listener = WakeWordListener(current, gate, onWake = ::onWake, onError = ::fail).also { it.start() }
    VoiceState.update(VoiceStatus.LISTENING)
  }

  /** The wake listener has already released the microphone. */
  private fun onWake() {
    if (isDestroyed) return
    listener = null
    startInteraction()
  }

  // ---- one-tap ----

  private fun beginTalk() {
    val wasHandsFree = isHandsFree
    if (!enterForeground(currentNotification(talking = !wasHandsFree))) return
    if (!wasHandsFree) isOneShot = true
    listener?.stop()
    listener = null
    startInteraction()
  }

  // ---- one interaction ----

  private fun startInteraction() {
    VoiceTimings.wake()
    VoiceState.update(VoiceStatus.BUSY)
    main.removeCallbacks(dismiss)
    hasOverlay = overlay.show() // plays the entrance on the first visible frame
    if (hasOverlay) {
      overlay.setAction(null)
      overlay.setMessage("")
      overlay.setTranscript("")
      overlay.setState("listening")
      VoiceTimings.overlayShown()
    }
    feedback.ignite() // chime and haptic tick, in step with the entrance
    // Listening starts at once; the chime and the entrance play while the recogniser is already coming up.
    speech.listen(onStarted = VoiceTimings::sttStarted, onDone = ::onTranscript)
  }

  private fun onTranscript(text: String?) {
    if (isDestroyed) return
    VoiceTimings.sttFinished()
    if (isHandsFree) reevaluate() // the wake word is live again while the command runs
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
      return
    }
    if (isFinished) {
      notifications.result("Clovie", outcome.message, null)
    } else {
      notifications.result("Clovie heard you", lastTranscript, lastTranscript)
    }
    if (isOneShot) main.postDelayed({ shutdown() }, 800L)
  }

  /** A tap on the overlay's button: a user gesture, so Android lets it open the app. */
  private fun onOverlayAction() {
    main.removeCallbacks(dismiss)
    try {
      startActivity(notifications.deepLink(lastTranscript))
    } catch (_: Exception) {
      // Nothing to open; the overlay still closes.
    }
    dismiss.run()
  }

  // ---- plumbing ----

  private fun currentNotification(talking: Boolean = false): Notification {
    notifications.createChannels()
    if (talking || !isHandsFree && !policy.isEnabled) return notifications.talking()
    val now = System.currentTimeMillis()
    return notifications.handsFree(policy.evaluate(now, HandsFreeController.isCharging(this)), policy, now)
  }

  private fun enterForeground(notification: Notification): Boolean =
    try {
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
      val isBackground = e !is SecurityException
      if (isBackground && policy.isEnabled) notifications.readyToStart()
      fail(if (isBackground) VoiceError.BACKGROUND_START_BLOCKED else VoiceError.PERMISSION_DENIED)
      false
    }

  private fun registerPowerReceiver() {
    if (powerReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        reevaluate()
      }
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_POWER_DISCONNECTED)
    }
    ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    powerReceiver = receiver
  }

  /**
   * Held only while the microphone is open. With the screen off the CPU would otherwise sleep and the
   * audio stream stall, so listening cannot give it up between sounds without missing wake words.
   */
  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "clovie:voice").apply { acquire() }
  }

  private fun releaseWakeLock() {
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
  }

  private fun fail(reason: String) {
    VoiceState.update(VoiceStatus.ERROR, reason)
    cleanup()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun shutdown() {
    cleanup()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun cleanup() {
    speech.cancel()
    feedback.cancel()
    main.removeCallbacksAndMessages(null)
    VoiceCommandBridge.cancelAll()
    overlay.destroy()
    listener?.stop()
    listener = null
    engine?.close()
    engine = null
    releaseWakeLock()
    powerReceiver?.let {
      try {
        unregisterReceiver(it)
      } catch (_: IllegalArgumentException) {
        // Already unregistered.
      }
    }
    powerReceiver = null
  }

  override fun onDestroy() {
    isDestroyed = true
    isRunning = false
    cleanup()
    loader.shutdown()
    if (VoiceState.snapshot.status != VoiceStatus.ERROR) VoiceState.update(VoiceStatus.OFF)
    super.onDestroy()
  }

  companion object {
    const val ACTION_START = "expo.modules.clovievoice.START"
    const val ACTION_TALK = "expo.modules.clovievoice.TALK"
    const val ACTION_STOP = "expo.modules.clovievoice.STOP"
    const val ACTION_PAUSE = "expo.modules.clovievoice.PAUSE"
    const val ACTION_REEVALUATE = "expo.modules.clovievoice.REEVALUATE"
    const val EXTRA_CLASSIFIER = "classifier"
    const val EXTRA_THRESHOLD = "threshold"
    private const val RESULT_MS = 2_000L
    private const val OPEN_MS = 10_000L
    private const val PAUSE_MS = 60L * 60L * 1000L
    private const val NOT_HEARD = "Didn't catch that"
    private const val OPEN_LABEL = "Open Clovie"

    /** True while the service is alive in this process; the receivers use it to pick how to re-arm. */
    @Volatile
    var isRunning = false
      private set
  }
}
