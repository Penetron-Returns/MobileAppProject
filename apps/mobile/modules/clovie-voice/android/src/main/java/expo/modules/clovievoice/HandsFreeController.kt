package expo.modules.clovievoice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import androidx.core.content.ContextCompat

/**
 * Re-arming hands-free mode from outside the service: the opening-hours alarm, boot and app updates
 * land here. Android 14+ restricts starting a microphone foreground service from the background, so
 * the start is attempted and, when refused, replaced by a "tap to start" notification.
 *
 * While the service is alive it never needs a restart: outside its conditions it only closes the
 * microphone and keeps its notification, so an alarm just tells it to open the microphone again.
 */
object HandsFreeController {
  const val ACTION_REARM = "expo.modules.clovievoice.REARM"
  private const val ALARM_REQUEST = 7

  fun isCharging(context: Context): Boolean =
    context.getSystemService(BatteryManager::class.java).isCharging

  /** Inexact (no special permission) and allowed in Doze, so opening time can slip by a few minutes. */
  fun schedule(context: Context, policy: HandsFreePolicy, now: Long = System.currentTimeMillis()) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val intent = alarmIntent(context)
    val at = if (policy.isEnabled) policy.nextCheckAt(now) else null
    if (at == null) {
      alarms.cancel(intent)
    } else {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    }
  }

  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(alarmIntent(context))
  }

  private fun alarmIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      Intent(context, HandsFreeReceiver::class.java).setAction(ACTION_REARM),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  fun reevaluate(context: Context) {
    val policy = HandsFreePolicy(context)
    if (!policy.isEnabled) return
    val now = System.currentTimeMillis()
    schedule(context, policy, now)
    if (VoiceService.isRunning) {
      try {
        context.startService(Intent(context, VoiceService::class.java).setAction(VoiceService.ACTION_REEVALUATE))
      } catch (_: Exception) {
        // Not allowed to start a service right now; the running one re-checks on its own events.
      }
      return
    }
    if (policy.evaluate(now, isCharging(context)).state != DutyState.ON_DUTY) return
    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, VoiceService::class.java).setAction(VoiceService.ACTION_START),
      )
    } catch (_: Exception) {
      // ForegroundServiceStartNotAllowedException: the microphone service cannot start from the background.
      VoiceNotifications(context, VoiceConfig.read(context)).readyToStart()
    }
  }
}

class HandsFreeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    HandsFreeController.reevaluate(context)
  }
}
