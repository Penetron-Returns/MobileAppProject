package expo.modules.clovievoice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Exceptions
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

/**
 * JS surface of "Hey Clovie". The work happens in `VoiceService`; this module starts and stops
 * it and forwards status changes. `start` must be called while the app is on screen: Android
 * does not let a background app start a microphone foreground service.
 */
class ClovieVoiceModule : Module() {
  private val onStatus: (VoiceSnapshot) -> Unit = { sendEvent("onStatusChange", toMap(currentSnapshot())) }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ClovieVoice")
    Events("onStatusChange")

    OnCreate { VoiceState.addListener(onStatus) }
    OnDestroy { VoiceState.removeListener(onStatus) }

    // Foreground services of type microphone need API 29+ behaviour; notification channels need 26.
    Function("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.O }

    Function("getStatus") { toMap(currentSnapshot()) }

    AsyncFunction("start") { options: StartOptions ->
      start(options)
      toMap(currentSnapshot())
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
    Function("completeCommand") { id: String, status: String, message: String ->
      VoiceCommandBridge.complete(id, CommandOutcome(status, message))
    }

    // Latency of the last voice interaction in ms (wakeToOverlayMs, wakeToSttStartMs, sttMs, commandMs, totalMs).
    Function("getTimings") { VoiceTimings.last }

    Function("stop") {
      stop()
      toMap(currentSnapshot())
    }
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

  private fun start(options: StartOptions) {
    val ctx = context
    val config = VoiceConfig.read(ctx)
    val classifier = options.classifierPath?.takeIf { it.isNotBlank() } ?: config.classifier
    if (!VoiceConfig.modelsPresent(ctx, classifier)) {
      VoiceState.update(VoiceStatus.NOT_CONFIGURED)
      return
    }
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      VoiceState.update(VoiceStatus.ERROR, VoiceError.PERMISSION_DENIED)
      return
    }
    val status = VoiceState.snapshot.status
    if (status == VoiceStatus.STARTING || status == VoiceStatus.LISTENING || status == VoiceStatus.BUSY) return

    VoiceState.update(VoiceStatus.STARTING)
    val intent = Intent(ctx, VoiceService::class.java)
      .setAction(VoiceService.ACTION_START)
      .putExtra(VoiceService.EXTRA_CLASSIFIER, classifier)
    options.threshold?.let { intent.putExtra(VoiceService.EXTRA_THRESHOLD, it) }
    try {
      ContextCompat.startForegroundService(ctx, intent)
    } catch (e: Exception) {
      // ForegroundServiceStartNotAllowedException (API 31+): the app was not on screen.
      VoiceState.update(
        VoiceStatus.ERROR,
        if (e is SecurityException) VoiceError.PERMISSION_DENIED else VoiceError.BACKGROUND_START_BLOCKED,
      )
    }
  }

  private fun stop() {
    val ctx = context
    ctx.stopService(Intent(ctx, VoiceService::class.java))
    // The service reports OFF from onDestroy; cover the case where it never started.
    VoiceState.update(VoiceStatus.OFF)
  }
}
