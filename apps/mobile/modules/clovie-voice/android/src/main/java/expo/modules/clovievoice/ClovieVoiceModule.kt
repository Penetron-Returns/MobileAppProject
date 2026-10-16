package expo.modules.clovievoice

import android.Manifest
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class StartOptions : Record {
  /** Overrides the classifier from the manifest: an asset path or an absolute file path. */
  @Field
  val classifierPath: String? = null

  /** Detection threshold in (0, 1]; defaults to 0.5. */
  @Field
  val threshold: Float? = null
}

class HandsFreeOptions : Record {
  @Field
  val useOpeningHours: Boolean? = null

  @Field
  val onlyWhileCharging: Boolean? = null

  /** Business timezone (IANA), used to print times in the notification. */
  @Field
  val timezone: String? = null

  /** Opening windows for the next days as [start0, end0, start1, end1, ...] in epoch ms. */
  @Field
  val windows: List<Double>? = null
}

/**
 * JS surface of "Clovie voice". The work happens in `VoiceService`; this module starts and stops it,
 * stores the hands-free settings and forwards status changes. `start` and `startTalk` must be called
 * while the app is on screen: Android does not let a background app start a microphone service.
 */
class ClovieVoiceModule : Module() {
  private val onStatus: (VoiceSnapshot) -> Unit = { sendEvent("onStatusChange", toMap(currentSnapshot())) }

  /** Forwards what the in-app voice surface emits (the drawer's states, level, words and outcome) to JS. */
  private val uiListener = object : VoiceUiListener {
    override fun onVoiceState(state: String, level: Float?) {
      val body = mutableMapOf<String, Any?>("state" to state)
      if (level != null) body["level"] = level.toDouble()
      sendEvent("onVoiceState", body)
    }

    override fun onVoiceTranscript(text: String) {
      sendEvent("onVoiceTranscript", mapOf("text" to text))
    }

    override fun onVoiceOutcome(outcome: CommandOutcome) {
      sendEvent(
        "onVoiceOutcome",
        mapOf(
          "status" to outcome.status,
          "message" to outcome.message,
          "transcript" to outcome.transcript,
          "expectsReply" to outcome.expectsReply,
          "pendingApprovalId" to outcome.pendingApprovalId,
          "pendingKind" to outcome.pendingKind,
          "pendingTitle" to outcome.pendingTitle,
          "pendingRemaining" to outcome.pendingRemaining,
          "reason" to outcome.reason,
        ),
      )
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ClovieVoice")
    Events("onStatusChange", "onVoiceState", "onVoiceTranscript", "onVoiceOutcome")

    OnCreate {
      VoiceState.addListener(onStatus)
      VoiceUiBus.add(uiListener)
      publishShortcut()
    }
    OnDestroy {
      VoiceState.removeListener(onStatus)
      VoiceUiBus.remove(uiListener)
      AppPresence.setUiAttached(false)
    }

    // Whether the app is on screen. The activity callbacks are the native truth; JS also reports AppState (the first
    // value, before any resume event, and a cross-check). The service shows the in-app drawer only while both this
    // and `setVoiceUiAttached` hold; otherwise the overlay, exactly as before.
    OnActivityEntersForeground { AppPresence.setForeground(true) }
    OnActivityEntersBackground { AppPresence.setForeground(false) }
    Function("setAppForeground") { isForeground: Boolean -> AppPresence.setForeground(isForeground) }

    // JS has a voice drawer mounted and is listening for the voice events (companion on, plan has it).
    Function("setVoiceUiAttached") { isAttached: Boolean -> AppPresence.setUiAttached(isAttached) }

    // The in-app drawer's buttons. They act on the running service only; the answers are False when there is none.
    Function("stopListening") { VoiceService.instance?.stopListeningFromApp() }
    Function("cancel") { VoiceService.instance?.cancelFromApp() }
    Function("endVoice") { VoiceService.instance?.endFromApp() }
    Function("listenAgain") { VoiceService.instance?.listenAgainFromApp() ?: false }
    Function("answerApproval") { id: String, answer: String ->
      VoiceService.instance?.answerApprovalFromApp(id, answer == "yes") ?: false
    }

    // Foreground services of type microphone need API 29+ behaviour; notification channels need 26.
    Function("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.O }

    Function("getStatus") { toMap(currentSnapshot()) }

    // Hands-free (the wake word). Turns it on; the service decides from the conditions whether to listen now.
    AsyncFunction("start") { options: StartOptions ->
      start(options)
      toMap(currentSnapshot())
    }

    Function("stop") {
      stop()
      toMap(currentSnapshot())
    }

    // One-tap: listen for one command now, no wake word.
    AsyncFunction("startTalk") {
      startTalk()
      toMap(currentSnapshot())
    }

    Function("configureHandsFree") { options: HandsFreeOptions -> configureHandsFree(options) }

    Function("getHandsFree") { handsFreeMap() }

    // Quick Settings tile (Android 13+ can ask the system to add it with one tap).
    AsyncFunction("requestAddTile") { promise: Promise -> requestAddTile(promise) }

    // A second launcher icon ("Clovie Voice"): a target for Samsung's side key and other launchers.
    Function("setLauncherIconEnabled") { enabled: Boolean ->
      context.packageManager.setComponentEnabledSetting(
        ComponentName(context, "expo.modules.clovievoice.ClovieVoiceLauncher"),
        if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP,
      )
    }

    Function("isLauncherIconEnabled") {
      context.packageManager.getComponentEnabledSetting(
        ComponentName(context, "expo.modules.clovievoice.ClovieVoiceLauncher"),
      ) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
    }

    // "Display over other apps": the overlay (the voice UI) needs it; without it results come as notifications.
    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    Function("requestOverlayPermission") {
      val ctx = context
      ctx.startActivity(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    // Called by the app's headless JS task when a spoken command has run.
    Function("completeCommand") { id: String, status: String, message: String, transcript: String ->
      VoiceCommandBridge.complete(id, CommandOutcome(status, message, transcript))
    }

    // The same, with the follow-up fields (spoken text, expectsReply, the pending approval) as one JSON string.
    Function("completeCommandWithReply") { id: String, status: String, message: String, transcript: String, extras: String ->
      VoiceCommandBridge.complete(id, commandOutcomeWithReply(status, message, transcript, extras))
    }

    // Cloud transcription of our own captured clip (EXPO_PUBLIC_VOICE_CLOUD_STT). Stored, because the
    // tile, widget and side key start the service without any JS running.
    Function("setCloudStt") { enabled: Boolean -> CloudStt.setEnabled(context, enabled) }

    // The scoped device voice token and API base URL for native clip upload (encrypted at rest). `state` is
    // 'none' | 'ok' | 'rejected' (the server answered 401: mint a new one).
    Function("setVoiceToken") { token: String, apiUrl: String -> VoiceTokenStore.forContext(context).save(token, apiUrl) }
    Function("clearVoiceToken") { VoiceTokenStore.forContext(context).clear() }
    Function("getVoiceTokenState") { VoiceTokenStore.forContext(context).state().wire }

    // "Sounds" (a distinct cue per voice state) and "Read replies aloud" (on-device text-to-speech). Both default on.
    Function("getFeedbackSettings") {
      mapOf(
        "sounds" to VoiceFeedbackSettings.isSoundsEnabled(context),
        "readAloud" to VoiceFeedbackSettings.isReadAloudEnabled(context),
      )
    }
    Function("setSoundsEnabled") { enabled: Boolean -> VoiceFeedbackSettings.setSoundsEnabled(context, enabled) }
    // A short filler spoken at once while the companion thinks; ignored when read-aloud is off or nothing is listening.
    Function("speakInterim") { text: String -> VoiceService.instance?.speakInterim(text) }
    Function("setReadAloudEnabled") { enabled: Boolean -> VoiceFeedbackSettings.setReadAloudEnabled(context, enabled) }

    // Latency of the last voice interaction in ms (wakeToOverlayMs, wakeToSttStartMs, sttMs, commandMs, totalMs).
    Function("getTimings") { VoiceTimings.last }

    // A step the app's headless JS measured (headlessStartMs, todayMs): logged with the native ones. Allowlisted keys only.
    Function("recordTiming") { key: String, ms: Double -> VoiceTimings.external(key, ms.toLong()) }
  }

  /** "Not configured" is derived, not stored: it depends on which model files were bundled. */
  private fun currentSnapshot(): VoiceSnapshot {
    val ctx = context
    val config = VoiceConfig.read(ctx)
    val snapshot = VoiceState.snapshot
    return if (snapshot.status == VoiceStatus.OFF && !config.isComplete(ctx)) {
      VoiceSnapshot(VoiceStatus.NOT_CONFIGURED, null)
    } else {
      snapshot
    }
  }

  private fun toMap(snapshot: VoiceSnapshot) = mapOf(
    "status" to snapshot.status,
    "error" to snapshot.error,
    "wakePhrase" to VoiceConfig.read(context).wakePhrase,
  )

  private fun hasMicrophone(ctx: Context) =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  private fun start(options: StartOptions) {
    val ctx = context
    val config = VoiceConfig.read(ctx)
    val classifier = options.classifierPath?.takeIf { it.isNotBlank() } ?: config.classifier
    if (!VoiceConfig.modelsPresent(ctx, classifier)) {
      VoiceState.update(VoiceStatus.NOT_CONFIGURED)
      return
    }
    if (!hasMicrophone(ctx)) {
      VoiceState.update(VoiceStatus.ERROR, VoiceError.PERMISSION_DENIED)
      return
    }
    val status = VoiceState.snapshot.status
    if (status == VoiceStatus.STARTING || status == VoiceStatus.LISTENING || status == VoiceStatus.BUSY || status == VoiceStatus.STANDBY) return

    HandsFreePolicy(ctx).isEnabled = true
    VoiceState.update(VoiceStatus.STARTING)
    val intent = Intent(ctx, VoiceService::class.java)
      .setAction(VoiceService.ACTION_START)
      .putExtra(VoiceService.EXTRA_CLASSIFIER, classifier)
    options.threshold?.let { intent.putExtra(VoiceService.EXTRA_THRESHOLD, it) }
    try {
      ContextCompat.startForegroundService(ctx, intent)
    } catch (e: Exception) {
      // ForegroundServiceStartNotAllowedException (API 31+): the app was not on screen.
      HandsFreePolicy(ctx).isEnabled = false
      VoiceState.update(
        VoiceStatus.ERROR,
        if (e is SecurityException) VoiceError.PERMISSION_DENIED else VoiceError.BACKGROUND_START_BLOCKED,
      )
    }
  }

  private fun stop() {
    val ctx = context
    HandsFreePolicy(ctx).isEnabled = false
    HandsFreeController.cancel(ctx)
    ctx.stopService(Intent(ctx, VoiceService::class.java))
    // The service reports OFF from onDestroy; cover the case where it never started.
    VoiceState.update(VoiceStatus.OFF)
  }

  private fun startTalk() {
    val ctx = context
    if (!hasMicrophone(ctx)) {
      VoiceState.update(VoiceStatus.ERROR, VoiceError.PERMISSION_DENIED)
      return
    }
    try {
      ContextCompat.startForegroundService(ctx, Intent(ctx, VoiceService::class.java).setAction(VoiceService.ACTION_TALK))
    } catch (e: Exception) {
      VoiceState.update(
        VoiceStatus.ERROR,
        if (e is SecurityException) VoiceError.PERMISSION_DENIED else VoiceError.BACKGROUND_START_BLOCKED,
      )
    }
  }

  private fun configureHandsFree(options: HandsFreeOptions) {
    val ctx = context
    val policy = HandsFreePolicy(ctx)
    options.useOpeningHours?.let { policy.useOpeningHours = it }
    options.onlyWhileCharging?.let { policy.onlyWhileCharging = it }
    options.timezone?.let { policy.timezone = it }
    options.windows?.let { flat ->
      policy.windows = flat.chunked(2).filter { it.size == 2 }.map { DutyWindow(it[0].toLong(), it[1].toLong()) }
    }
    if (!policy.isEnabled) return
    HandsFreeController.schedule(ctx, policy)
    if (VoiceService.isRunning) HandsFreeController.reevaluate(ctx)
  }

  private fun handsFreeMap(): Map<String, Any?> {
    val ctx = context
    val policy = HandsFreePolicy(ctx)
    val duty = policy.evaluate(System.currentTimeMillis(), HandsFreeController.isCharging(ctx))
    return mapOf(
      "enabled" to policy.isEnabled,
      "useOpeningHours" to policy.useOpeningHours,
      "onlyWhileCharging" to policy.onlyWhileCharging,
      "duty" to duty.state,
      "untilMs" to duty.untilMs?.toDouble(),
      "windowsUntilMs" to policy.windows.maxOfOrNull { it.end }?.toDouble(),
    )
  }

  private fun requestAddTile(promise: Promise) {
    val ctx = context
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve("unsupported")
      return
    }
    val manager = ctx.getSystemService(StatusBarManager::class.java)
    manager.requestAddTileService(
      ComponentName(ctx, VoiceTileService::class.java),
      ctx.getString(R.string.clovie_talk_label),
      Icon.createWithResource(ctx, R.drawable.ic_clovie_tile),
      ContextCompat.getMainExecutor(ctx),
    ) { result ->
      promise.resolve(
        when (result) {
          StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED -> "added"
          StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> "already"
          StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED -> "dismissed"
          else -> "error"
        },
      )
    }
  }

  /** The "Talk to Clovie" shortcut when long-pressing the app icon. */
  private fun publishShortcut() {
    val ctx = appContext.reactContext ?: return
    try {
      val shortcut = ShortcutInfoCompat.Builder(ctx, "talk")
        .setShortLabel(ctx.getString(R.string.clovie_talk_label))
        .setLongLabel(ctx.getString(R.string.clovie_talk_label))
        .setIcon(IconCompat.createWithResource(ctx, R.drawable.ic_clovie_color))
        .setIntent(Intent(ctx, VoiceTalkActivity::class.java).setAction(Intent.ACTION_VIEW))
        .build()
      ShortcutManagerCompat.pushDynamicShortcut(ctx, shortcut)
    } catch (_: Exception) {
      // Shortcuts are a convenience; never fail the module over them.
    }
  }
}
