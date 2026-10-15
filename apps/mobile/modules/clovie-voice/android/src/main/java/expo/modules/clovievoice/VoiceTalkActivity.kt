package expo.modules.clovievoice

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

/**
 * The single door for "Talk to Clovie" (tile, widget, shortcut, launcher icon, side key, the "ready"
 * notification). Android only lets a microphone foreground service start while the app is visible,
 * so this transparent activity starts it and finishes once the service is up. The phone returns to
 * whatever the owner was doing; the overlay and the listening happen in the service.
 */
class VoiceTalkActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  private val listener: (VoiceSnapshot) -> Unit = { snapshot ->
    if (snapshot.status != VoiceStatus.STARTING) main.post { leave() }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      // First use: let the owner grant the microphone in the app's voice settings.
      val scheme = VoiceConfig.read(this).scheme
      startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse("$scheme://settings/voice"))
          .setPackage(packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      leave()
      return
    }
    val action = if (intent.getBooleanExtra(EXTRA_HANDS_FREE, false)) VoiceService.ACTION_START else VoiceService.ACTION_TALK
    VoiceState.addListener(listener)
    try {
      ContextCompat.startForegroundService(this, Intent(this, VoiceService::class.java).setAction(action))
    } catch (_: Exception) {
      leave()
      return
    }
    // The service reports a state change once it is up; do not hang around if it never does.
    main.postDelayed({ leave() }, MAX_WAIT_MS)
  }

  private fun leave() {
    VoiceState.removeListener(listener)
    main.removeCallbacksAndMessages(null)
    if (!isFinishing) {
      finish()
      if (Build.VERSION.SDK_INT >= 34) {
        overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
      } else {
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
      }
    }
  }

  override fun onDestroy() {
    VoiceState.removeListener(listener)
    super.onDestroy()
  }

  companion object {
    const val EXTRA_HANDS_FREE = "handsFree"
    private const val MAX_WAIT_MS = 1_500L
  }
}
