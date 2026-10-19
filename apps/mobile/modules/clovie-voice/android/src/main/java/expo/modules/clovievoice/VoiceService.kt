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
import android.os.SystemClock
import android.util.Log
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
  private var clip: ClipCapture? = null
  private var clipFile: java.io.File? = null
  private lateinit var overlay: VoiceOverlay
  private val appSurface = AppVoiceSurface()

  /** Where the current interaction is drawn: the overlay, or the in-app drawer when the app is open. */
  private lateinit var surface: VoiceSurface
  private lateinit var feedback: VoiceFeedback
  private lateinit var speaker: VoiceSpeaker
  private var speakTask: Runnable? = null
  private var gate = WakeWordGate()
  private var classifier: String? = null
  private var engine: WakeWordEngine? = null
  private var isLoadingEngine = false
  private var listener: WakeWordListener? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var powerReceiver: BroadcastReceiver? = null
  private var isHandsFree = false
  private var hasSurface = false
  private var lastTranscript = ""
  @Volatile
  private var isDestroyed = false
  /** True from the wake word until the overlay has gone; the microphone stays closed meanwhile. */
  @Volatile
  private var isInteracting = false

  /** The approval a yes or no now applies to (read from other threads by `answerApproval`). Empty when none. */
  @Volatile
  private var pendingApprovalId = ""

  /** The executed action an "undo" now applies to (read from other threads by `undoActionFromApp`). Empty when none. */
  @Volatile
  private var pendingActionId = ""

  /** Bumped when an interaction starts or is cancelled: a late upload or command result of an older one is dropped. */
  private var epoch = 0
  private val startClipTask = Runnable { startClip() }
  private var rearmFailures = 0
  private var dismissReason = "timeout"
  /** The conversation so far (what JS left pending), the follow-up turns used, and whether the current capture is one. */
  private var followUp = FollowUpState.NONE
  private var followUpsDone = 0
  private var isFollowUpTurn = false
  private var latencyEndpoint = "none"
  private var latencyPath = "device"
  private val dismiss = Runnable {
    Log.i(TAG, "overlay dismissed reason=$dismissReason")
    stopSpeech()
    surface.hide()
    main.postDelayed(::finishInteraction, surface.exitMs + 60)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    config = VoiceConfig.read(this)
    policy = HandsFreePolicy(this)
    notifications = VoiceNotifications(this, config)
    overlay = VoiceOverlay(this, ::onOverlayAction)
    surface = overlay
    feedback = VoiceFeedback(this)
    speaker = VoiceSpeaker(this)
    instance = this
    speech = SpeechCapture(
      this,
      onModelDownload = notifications::speechDownloading,
      onPartial = ::onPartialTranscript,
      onSpeechEnd = { endpoint -> onSpeechEnd(endpoint, "device") },
    ) { surface.pushRms(it) }
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
      isInteracting -> Unit // an interaction is running; it re-arms when it ends
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
    listener = WakeWordListener(current, gate, onWake = ::onWake, onError = ::onListenerError).also { it.start() }
    VoiceState.update(VoiceStatus.LISTENING)
  }

  /** A failed microphone right after a recogniser run is usually still being released: retry before giving up. */
  private fun onListenerError(reason: String) {
    if (isDestroyed) return
    val retryIn = if (reason == VoiceError.AUDIO_FAILED) InteractionPolicy.rearmRetryDelayMs(++rearmFailures) else null
    if (retryIn == null) return fail(reason)
    Log.w(TAG, "wake listener failed reason=$reason retryInMs=$retryIn failures=$rearmFailures")
    listener = null
    main.postDelayed(::reevaluate, retryIn)
  }

  /** The wake listener has already released the microphone. */
  private fun onWake() {
    if (isDestroyed) return
    listener = null
    rearmFailures = 0
    startInteraction()
  }

  // ---- one-tap ----

  private fun beginTalk() {
    val wasHandsFree = isHandsFree
    if (!enterForeground(currentNotification(talking = !wasHandsFree))) return
    listener?.stop()
    listener = null
    startInteraction()
  }

  // ---- one interaction ----

  /** Words as they are recognised, shown live in the overlay or the in-app drawer. Never logged. */
  private fun onPartialTranscript(text: String) {
    if (isDestroyed || !isInteracting || !hasSurface) return
    surface.setTranscript(text)
  }

  /**
   * The owner has stopped speaking (recogniser, endpointer or clip VAD): zero for the latency timings, and an
   * instant "heard you" cue and tick before the transcript or the request exist. `enterProcessing` repeats this later
   * and does nothing twice.
   */
  private fun onSpeechEnd(endpoint: String, path: String) {
    if (isDestroyed || !isInteracting) return
    VoiceTimings.speechEnded()
    latencyEndpoint = endpoint
    latencyPath = path
    if (hasSurface) surface.setState("processing")
    feedback.acknowledge()
  }

  private fun startInteraction() {
    isInteracting = true
    epoch += 1
    pendingApprovalId = ""
    pendingActionId = ""
    followUp = FollowUpState.NONE
    followUpsDone = 0
    isFollowUpTurn = false
    VoiceTimings.wake()
    VoiceState.update(VoiceStatus.BUSY)
    main.removeCallbacks(dismiss)
    surface = chooseSurface()
    hasSurface = surface.show() // plays the entrance on the first visible frame
    if (hasSurface) {
      surface.setAction(null)
      surface.setMessage("")
      surface.setTranscript("")
      surface.setState("listening")
      VoiceTimings.overlayShown()
    }
    Log.i(TAG, "overlay shown=$hasSurface inApp=${surface === appSurface}")
    feedback.ignite() // chime and haptic tick, in step with the entrance
    // Start the text-to-speech engine now: it takes a moment, and the answer should not wait for it.
    if (VoiceFeedbackSettings.isReadAloudEnabled(this)) speaker.warmUp()
    warmUpBackend()
    // The wake-word recorder is already stopped and released (listener == null).
    if (CloudStt.isEnabled(this)) startClip() else startRecogniser()
  }

  /** The in-app drawer when the app is on screen and its JS draws it; the system overlay otherwise. */
  private fun chooseSurface(): VoiceSurface =
    when (VoiceRouting.surfaceFor(AppPresence.isForeground, AppPresence.isUiAttached)) {
      SurfaceKind.IN_APP -> appSurface
      SurfaceKind.OVERLAY -> overlay
    }

  /**
   * While the owner is still speaking, opens the connection to our API (DNS, TLS, the Edge Function and its
   * token lookup) and has the app's JS load today's bookings, so neither is on the path after the clip ends.
   * Both are best effort. Only while listening: nothing runs at rest.
   */
  private fun warmUpBackend() {
    warmUpConnection()
    try {
      // Also on the recogniser path: the app's JS runtime starts and pings our API (TLS and the Edge isolate) while the
      // owner is still speaking, so neither is on the path after the end of speech.
      startService(
        Intent(this, VoiceCommandTaskService::class.java)
          .putExtra(VoiceCommandTaskService.EXTRA_PREFETCH, true)
          .putExtra(VoiceCommandTaskService.EXTRA_WARM, true),
      )
    } catch (_: Exception) {
      // The headless task starts again for the command itself.
    }
  }

  private fun warmUpConnection() {
    if (!CloudStt.isEnabled(this)) return
    val credentials = VoiceTokenStore.forContext(this).read() ?: return
    Thread({ VoiceTimings.external("pingMs", CloudTranscriber.warm(credentials)) }, "clovie-warm").start()
  }

  /** Android's SpeechRecognizer; the short delay lets the audio HAL hand the microphone over. */
  private fun startRecogniser() {
    Log.i(TAG, "stt path=recogniser wakeRecorderReleased=${listener == null} handoffMs=$MIC_HANDOFF_MS")
    if (hasSurface) surface.setState("listening")
    speech.listen(MIC_HANDOFF_MS, onStarted = VoiceTimings::sttStarted, onDone = ::onTranscript)
  }

  /** Our own capture (VAD-ended WAV), transcribed by the app through the backend. */
  private fun startClip() {
    Log.i(TAG, "stt path=clip")
    VoiceTimings.sttStarted()
    val noSpeechMs = when {
      !isFollowUpTurn -> ClipVad.NO_SPEECH_MS
      followUp.hasPendingAction -> UndoWindow.noSpeechMs(System.currentTimeMillis(), followUp.undoUntilMs)
      else -> FollowUp.NO_SPEECH_MS
    }
    val capture = ClipCapture(this, noSpeechMs) { surface.pushLevel(it) }
    clip = capture
    capture.start(::onClip)
  }

  private fun onClip(result: ClipResult) {
    if (isDestroyed) return
    clip = null
    VoiceTimings.sttFinished()
    when (result) {
      is ClipResult.NoSpeech -> if (isFollowUpTurn) endFollowUpQuietly() else showOutcome(CommandOutcome("error", NOT_HEARD))
      is ClipResult.Failed -> if (isFollowUpTurn) endFollowUpQuietly() else {
        Log.w(TAG, "clip capture failed: falling back to the recogniser")
        startRecogniser()
      }
      is ClipResult.Captured -> {
        onSpeechEnd("clip", "cloud")
        // With a device token the service uploads by itself, so it works with no JS runtime running.
        val credentials = VoiceTokenStore.forContext(this).read()
        if (credentials != null) uploadClip(result.file, credentials) else transcribeClip(result.file)
      }
    }
  }

  /** Native upload of the clip with the device voice token; the transcript then goes down the normal command path. */
  private fun uploadClip(file: java.io.File, credentials: VoiceCredentials) {
    clipFile = file
    enterProcessing()
    val ticket = epoch
    Thread({
      val result = CloudTranscriber.transcribe(credentials, file)
      VoiceTimings.uploadFinished((result as? CloudResult.Text)?.timing ?: ServerTiming.NONE)
      main.post { onUploaded(result, ticket) }
    }, "clovie-upload").start()
  }

  private fun onUploaded(result: CloudResult, ticket: Int) {
    deleteClip()
    if (isDestroyed || ticket != epoch) return // cancelled while uploading
    when (result) {
      is CloudResult.Text -> {
        val text = result.text.trim()
        if (text.isEmpty()) showOutcome(CommandOutcome("error", NOT_HEARD)) else runCommand(text)
      }
      is CloudResult.Failure -> {
        Log.w(TAG, "cloud transcription failed ${result.describe()}")
        // The app replaces a refused token the next time it is on screen.
        if (result.status == 401) VoiceTokenStore.forContext(this).markRejected()
        onCloudLost()
      }
    }
  }

  /**
   * A captured clip could not be transcribed. The owner has already spoken, so the on-device recogniser would only
   * hear silence: say so instead, and keep a follow-up conversation going (its approval state kept) within its cap.
   */
  private fun onCloudLost() {
    val decision = CloudFallback.afterFailure(true, isFollowUpTurn, followUpsDone, followUp.pendingRemaining)
    if (decision is AfterCloudFailure.SpeakError) {
      showOutcome(
        CommandOutcome(
          "error", SpokenReply.LOST_CONNECTION_SPOKEN,
          expectsReply = decision.listenAgain,
          pendingApprovalId = followUp.pendingApprovalId,
          pendingKind = followUp.pendingKind,
          pendingQueue = followUp.pendingQueue,
          pendingRemaining = followUp.pendingRemaining,
          pendingActionId = followUp.pendingActionId,
          undoUntilMs = followUp.undoUntilMs,
          reason = "network",
        ),
      )
    } else {
      startRecogniser()
    }
  }

  private fun transcribeClip(file: java.io.File) {
    clipFile = file
    enterProcessing()
    VoiceTimings.commandStarted()
    val id = VoiceCommandBridge.register(VoiceCommandBridge.CLIP_TIMEOUT_MS, "fallback", ::onClipOutcome)
    try {
      startService(
        Intent(this, VoiceCommandTaskService::class.java)
          .putExtra(VoiceCommandTaskService.EXTRA_ID, id)
          .putExtra(VoiceCommandTaskService.EXTRA_CLIP_PATH, file.absolutePath)
          .putExtra(VoiceCommandTaskService.EXTRA_STARTED_AT, System.currentTimeMillis().toString())
          .let(::withFollowUp)
      )
    } catch (_: Exception) {
      VoiceCommandBridge.complete(id, CommandOutcome("fallback", ""))
    }
  }

  /** The clip is uploaded (or has failed) by now: delete it. A failed upload falls back to the recogniser, once. */
  private fun onClipOutcome(outcome: CommandOutcome) {
    deleteClip()
    if (isDestroyed) return
    if (outcome.status == "fallback") {
      Log.w(TAG, "cloud transcription failed ${outcome.message.ifEmpty { "status=? code=?" }}")
      onCloudLost()
      return
    }
    lastTranscript = outcome.transcript
    if (hasSurface && outcome.transcript.isNotEmpty()) surface.setTranscript(outcome.transcript)
    showOutcome(outcome)
  }

  private fun deleteClip() {
    clipFile?.delete()
    clipFile = null
  }

  private fun onTranscript(result: SttOutcome) {
    if (isDestroyed) return
    VoiceTimings.sttFinished()
    val text = result.text
    if (text == null) {
      showOutcome(CommandOutcome("error", if (result.reason == "language") SPEECH_UNAVAILABLE else NOT_HEARD))
      return
    }
    runCommand(text)
  }

  /** Hands a transcript to the app's JS (headless task); without JS it times out into "Open Clovie". */
  private fun runCommand(text: String) {
    VoiceTimings.finalTranscript()
    lastTranscript = text
    if (hasSurface) surface.setTranscript(text)
    enterProcessing()
    VoiceTimings.commandStarted()
    val id = VoiceCommandBridge.register(onOutcome = ::showOutcome)
    try {
      startService(
        Intent(this, VoiceCommandTaskService::class.java)
          .putExtra(VoiceCommandTaskService.EXTRA_ID, id)
          .putExtra(VoiceCommandTaskService.EXTRA_TRANSCRIPT, text)
          .putExtra(VoiceCommandTaskService.EXTRA_STARTED_AT, System.currentTimeMillis().toString())
          .let(::withFollowUp),
      )
    } catch (_: Exception) {
      VoiceCommandBridge.complete(id, CommandOutcome("open_app", ""))
    }
  }

  /** The interaction is over (overlay gone): re-arm the wake word, or stop when this was a one-shot. */
  private fun finishInteraction() {
    if (isDestroyed) return
    isInteracting = false
    when (InteractionPolicy.after(isHandsFree)) {
      InteractionPolicy.After.REARM -> {
        Log.i(TAG, "rearmed")
        reevaluate()
      }
      InteractionPolicy.After.STOP -> {
        Log.i(TAG, "stopped")
        shutdown()
      }
    }
  }

  /** Listening has ended and the words are being understood: the overlay's processing state and its soft cue. */
  private fun enterProcessing() {
    if (hasSurface) surface.setState("processing")
    feedback.processing()
  }

  private fun showOutcome(outcome: CommandOutcome) {
    if (isDestroyed) return
    VoiceTimings.commandDone()
    val isFinished = outcome.status == "done" || outcome.status == "error"
    // The sound for the state (the processing pulse stops here), then the spoken reply after it.
    val cue = CuePolicy.cueFor(if (isFinished) outcome.status else "request") ?: Cue.FAILURE
    feedback.result(cue)
    val spoken = SpokenReply.forOutcome(outcome.status, outcome.message, NOT_HEARD, SPEECH_UNAVAILABLE, outcome.spoken)
    // What JS says is pending (an approval just read aloud) is echoed back with the next turn; cleared otherwise.
    followUp = FollowUpState.after(outcome)
    pendingApprovalId = followUp.pendingApprovalId
    pendingActionId = followUp.pendingActionId
    val listenAgain = FollowUp.shouldListenAgain(outcome.status, outcome.expectsReply, followUpsDone, outcome.pendingRemaining)
    if (hasSurface) {
      surface.onOutcome(outcome)
      if (isFinished) {
        surface.setMessage(if (outcome.message == NOT_HEARD) "" else outcome.message)
        surface.setState(outcome.status)
        dismissReason = outcome.reason.ifEmpty { outcome.status }
        if (listenAgain) {
          waitForSpeechThenListenAgain(cue, spoken)
          return
        }
        if (isHoldingForApproval()) {
          // The card stays up until the owner decides or closes the drawer: nothing dismisses it.
          speakAfterCue(cue, spoken, watch = true) { holdForAnswer() }
          return
        }
        dismissAfterSpeech(cue, spoken, if (outcome.status == "error") ERROR_MS else RESULT_MS)
      } else {
        // JS could not finish it (or did not answer): the owner taps to continue in the app.
        surface.setMessage("")
        surface.setState("request")
        surface.setAction(OPEN_LABEL)
        dismissReason = "open_timeout"
        dismissAfterSpeech(cue, spoken, OPEN_MS)
      }
      return
    }
    if (isFinished) {
      notifications.result("Clovie", if (outcome.message == SPEECH_UNAVAILABLE) SPEECH_UNAVAILABLE_TEXT else outcome.message, null)
    } else {
      notifications.result("Clovie heard you", lastTranscript, lastTranscript)
    }
    if (listenAgain) return waitForSpeechThenListenAgain(cue, spoken)
    speakAfterCue(cue, spoken) { main.postDelayed(::finishInteraction, 800L) }
  }

  // ---- follow-up: listen again after a spoken question, with no wake word ----

  /**
   * Speaks the reply, then listens for the answer. The watchdog ends the interaction if speech never reports back;
   * it is cancelled once the capture starts (that is bounded by its own timeouts).
   */
  private fun waitForSpeechThenListenAgain(cue: Cue, spoken: String?) {
    dismissReason = "follow_up_watchdog"
    speakAfterCue(cue, spoken, watch = hasSurface) { listenAgain() }
  }

  /** A short filler from JS ("One sec, checking.") while the companion thinks; the final reply queues behind it. */
  fun speakInterim(text: String) {
    main.post {
      if (isDestroyed || !isInteracting || !VoiceFeedbackSettings.isReadAloudEnabled(this)) return@post
      speaker.speakInterim(text, onStart = VoiceTimings::interimStarted)
    }
  }

  /** Sends this turn's latency numbers (once) to the app for PostHog, and to logcat. No text, no names. */
  private fun reportLatency() {
    val offsets = VoiceTimings.latencyOffsets() ?: return
    val values = HashMap<String, Any>(offsets)
    values["endpoint"] = latencyEndpoint
    values["sttPath"] = latencyPath
    Log.i(TAG, "latency $values")
    VoiceUiBus.latency(values)
  }

  /** The soft wake cue, then one more clip with the same capture and VAD; 6 s without speech gives up quietly. */
  private fun listenAgain() {
    if (isDestroyed) return
    // An executed action is listened for only while it can still be undone.
    if (followUp.hasPendingAction && !UndoWindow.isOpen(System.currentTimeMillis(), followUp.undoUntilMs)) {
      return endFollowUpQuietly()
    }
    VoiceTimings.resetTurn()
    warmUpConnection() // a follow-up comes ~30 s after the last upload: the pooled socket may be dead by now
    followUpsDone += 1
    isFollowUpTurn = true
    Log.i(TAG, "follow-up turn=$followUpsDone pending=${followUp.hasPending} remaining=${followUp.pendingRemaining}")
    if (hasSurface) {
      surface.setTranscript("")
      surface.setState("listening") // the reply text stays on screen
    }
    feedback.listeningAgain()
    // The microphone opens after the cue so the chime is not recorded.
    main.postDelayed(startClipTask, feedback.leadInMs(Cue.WAKE))
  }

  /** Nothing said (or the microphone failed) in a follow-up: close without a sound or an error. */
  private fun endFollowUpQuietly() {
    if (isHoldingForApproval()) return holdForAnswer()
    if (isHoldingForAction()) {
      return holdForAnswer(UndoWindow.holdMs(System.currentTimeMillis(), followUp.undoUntilMs, APP_HOLD_MS))
    }
    dismissReason = "follow_up_silent"
    dismiss.run()
  }

  // ---- in-app drawer: what its buttons do ----

  /** In the drawer an approval card is on screen, so it is not dismissed on a timer like the overlay's text. */
  private fun isHoldingForApproval() = surface === appSurface && followUp.hasPending

  /** In the drawer the Undo button stays up for the rest of an open undo window, with the microphone closed. */
  private fun isHoldingForAction() =
    surface === appSurface && followUp.hasPendingAction && UndoWindow.isOpen(System.currentTimeMillis(), followUp.undoUntilMs)

  /** The microphone is closed and nothing is spoken; the card waits for a tap or a mic tap, bounded so it cannot linger. */
  private fun holdForAnswer(maxMs: Long = APP_HOLD_MS) {
    if (isDestroyed) return
    dismissReason = "app_hold"
    main.removeCallbacks(dismiss)
    main.postDelayed(dismiss, maxMs)
    surface.setWaiting()
  }

  /** Drops everything in flight (capture, speech, command, timers) without ending the interaction. */
  private fun abortInFlight() {
    epoch += 1
    main.removeCallbacks(dismiss)
    main.removeCallbacks(startClipTask)
    clip?.cancel()
    clip = null
    speech.cancel()
    stopSpeech()
    feedback.cancel()
    VoiceCommandBridge.cancelAll()
    deleteClip()
  }

  /** Stop: ends the recording now and sends what was said. */
  fun stopListeningFromApp() {
    main.post { if (!isDestroyed && isInteracting) clip?.stop() }
  }

  /** Cancel while thinking: drops the request and listens again, with the conversation (a pending approval) kept. */
  fun cancelFromApp() {
    main.post {
      if (isDestroyed || !isInteracting || surface !== appSurface) return@post
      abortInFlight()
      isFollowUpTurn = false
      surface.setTranscript("")
      surface.setState("listening")
      feedback.listeningAgain()
      main.postDelayed(startClipTask, feedback.leadInMs(Cue.WAKE))
    }
  }

  /** The drawer was closed (Show chat, back): ends the interaction at once. */
  fun endFromApp() {
    main.post {
      if (isDestroyed || !isInteracting) return@post
      abortInFlight()
      dismissReason = "app_closed"
      dismiss.run()
    }
  }

  /** The mic button: stops reading and listens for the answer now. False when no interaction is open to do it. */
  fun listenAgainFromApp(): Boolean {
    if (isDestroyed || !isInteracting) return false
    main.post {
      if (isDestroyed || !isInteracting || surface !== appSurface) return@post
      abortInFlight()
      listenAgain()
    }
    return true
  }

  /**
   * Approve or Decline in the drawer: sent through the same path as a spoken yes or no, so it binds to the approval
   * the service holds (the one just shown) and nothing else. False when `id` is not that approval (it was replaced
   * or has gone): the caller must not decide it.
   */
  fun answerApprovalFromApp(id: String, isYes: Boolean): Boolean {
    if (isDestroyed || !isInteracting || id.isEmpty() || id != pendingApprovalId) return false
    main.post {
      if (isDestroyed || !isInteracting || id != followUp.pendingApprovalId) return@post
      abortInFlight()
      runCommand(if (isYes) "yes" else "no")
    }
    return true
  }

  /**
   * Undo in the drawer, through the same path as a spoken "undo": it applies to the action the service is holding, and
   * only if `id` is that action. False when it is not (nothing was undone), so the caller must not undo it.
   */
  fun undoActionFromApp(id: String): Boolean {
    if (isDestroyed || !isInteracting || id.isEmpty() || id != pendingActionId) return false
    main.post {
      if (isDestroyed || !isInteracting || id != followUp.pendingActionId) return@post
      abortInFlight()
      runCommand("undo that")
    }
    return true
  }

  /** The conversation state JS sent with the previous outcome, passed back so a yes or no binds to its approval. */
  private fun withFollowUp(intent: Intent): Intent {
    if (followUp.hasPendingAction) {
      intent
        .putExtra(VoiceCommandTaskService.EXTRA_PENDING_ACTION_ID, followUp.pendingActionId)
        .putExtra(VoiceCommandTaskService.EXTRA_UNDO_UNTIL_MS, followUp.undoUntilMs.toString())
    }
    if (!followUp.hasPending) return intent
    return intent
      .putExtra(VoiceCommandTaskService.EXTRA_PENDING_APPROVAL_ID, followUp.pendingApprovalId)
      .putExtra(VoiceCommandTaskService.EXTRA_PENDING_KIND, followUp.pendingKind)
      .putExtra(VoiceCommandTaskService.EXTRA_PENDING_QUEUE, followUp.pendingQueue)
  }

  /**
   * Keeps the overlay up for `holdMs`, or until the reply has been spoken if that is later, so the
   * text and the voice line up. A watchdog dismisses it if speech never reports back.
   */
  private fun dismissAfterSpeech(cue: Cue, spoken: String?, holdMs: Long) {
    val startedAt = SystemClock.uptimeMillis()
    speakAfterCue(cue, spoken, watch = hasSurface) {
      val remaining = startedAt + holdMs - SystemClock.uptimeMillis()
      main.postDelayed(dismiss, maxOf(remaining, AFTER_SPEECH_MS))
    }
  }

  /**
   * Speaks `text` once the cue has played, then calls `onDone`; at once when there is nothing to say or reading
   * aloud is off. With `watch`, the overlay's watchdog follows the speech itself: it fires only if speech does not
   * START within [SpeechWatchdog.START_WAIT_MS], or does not finish within [SpeechWatchdog.doneBoundMs] of the text.
   * It is cleared before `onDone` runs.
   */
  private fun speakAfterCue(cue: Cue, text: String?, watch: Boolean = false, onDone: () -> Unit) {
    if (text == null || !VoiceFeedbackSettings.isReadAloudEnabled(this)) {
      reportLatency()
      return onDone()
    }
    // The engine needs a moment between speak() and sound: ask it a little early so the first word follows the cue
    // instead of waiting for it to finish.
    val lead = maxOf(0L, feedback.leadInMs(cue) - TTS_PREROLL_MS)
    if (watch) main.postDelayed(dismiss, lead + SpeechWatchdog.START_WAIT_MS)
    val task = Runnable {
      speakTask = null
      speaker.speak(
        text,
        onStart = {
          VoiceTimings.ttsStarted()
          reportLatency()
          if (watch && !isDestroyed) {
            main.removeCallbacks(dismiss)
            main.postDelayed(dismiss, SpeechWatchdog.doneBoundMs(text.length))
          }
        },
      ) {
        if (watch) main.removeCallbacks(dismiss)
        if (!isDestroyed) onDone()
      }
    }
    speakTask = task
    main.postDelayed(task, lead)
  }

  private fun stopSpeech() {
    speakTask?.let { main.removeCallbacks(it) }
    speakTask = null
    speaker.stop()
  }

  /** A tap on the overlay's button: a user gesture, so Android lets it open the app. */
  private fun onOverlayAction() {
    main.removeCallbacks(dismiss)
    dismissReason = "action"
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
    Log.i(TAG, "stopped")
    cleanup()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun cleanup() {
    if (instance === this) instance = null
    speech.cancel()
    speaker.shutdown()
    clip?.cancel()
    clip = null
    deleteClip()
    feedback.cancel()
    main.removeCallbacksAndMessages(null)
    VoiceCommandBridge.cancelAll()
    overlay.destroy()
    appSurface.hide() // stops its level ticks and tells an open drawer the interaction is over
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
    private const val TAG = "ClovieVoice"
    private const val RESULT_MS = 2_000L
    private const val ERROR_MS = 2_500L
    private const val MIC_HANDOFF_MS = 150L
    private const val OPEN_MS = 10_000L
    private const val AFTER_SPEECH_MS = 450L
    private const val PAUSE_MS = 60L * 60L * 1000L

    /** How long the in-app card waits for a tap with nothing happening before the interaction closes. */
    private const val APP_HOLD_MS = 120_000L
    private const val NOT_HEARD = "Didn't catch that"

    /** Sent to the overlay page as the error message; it maps it to text. Notifications use the plain text below. */
    /** Speech is requested this long before the cue ends (the engine's own start-up). */
    private const val TTS_PREROLL_MS = 250L
    private const val SPEECH_UNAVAILABLE = "speech_unavailable"
    private const val SPEECH_UNAVAILABLE_TEXT = "Speech isn't set up on this phone. Install English in the phone's speech settings."
    private const val OPEN_LABEL = "Open Clovie"

    /** The running service, for the module's `speakInterim`; null when none. */
    @Volatile
    var instance: VoiceService? = null
      private set

    /** True while the service is alive in this process; the receivers use it to pick how to re-arm. */
    @Volatile
    var isRunning = false
      private set
  }
}
