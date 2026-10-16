package expo.modules.clovievoice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Everything the voice service shows: its ongoing notification, results, and the hand-off to the app. */
class VoiceNotifications(private val context: Context, private val config: VoiceConfig) {

  fun createChannels() {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(LISTENING_CHANNEL, "Hey Clovie listening", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while Clovie is listening."
        setShowBadge(false)
      },
    )
    manager.createNotificationChannel(
      NotificationChannel(RESULT_CHANNEL, "Hey Clovie commands", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Results of a spoken command, and a reminder to start hands-free."
      },
    )
  }

  /** The ongoing notification of a one-tap "Talk to Clovie": listening for one command. */
  fun talking(): Notification =
    base("Clovie is listening", "Say what you need.")
      .addAction(0, "Stop", service(VoiceService.ACTION_STOP, REQUEST_STOP))
      .build()

  /** The ongoing notification of hands-free mode, with Pause (1 h) and Stop. */
  fun handsFree(duty: Duty, policy: HandsFreePolicy, now: Long): Notification {
    val (title, text) = when (duty.state) {
      DutyState.ON_DUTY -> "Clovie is on duty: listening for \"${config.wakePhrase}\"" to
        (duty.untilMs?.let { "Until ${policy.describeTime(it, now)}." } ?: "Say it any time.")
      DutyState.PAUSED -> "Clovie is paused" to
        (duty.untilMs?.let { "Back on duty at ${policy.describeTime(it, now)}." } ?: "")
      DutyState.WAITING_CHARGER -> "Clovie is off duty" to "Waiting for the charger."
      else -> "Clovie is off duty" to
        (duty.untilMs?.let { "On duty again at ${policy.describeTime(it, now)}." } ?: "Open Clovie to refresh opening hours.")
    }
    return base(title, text)
      .addAction(0, "Pause (1 h)", service(VoiceService.ACTION_PAUSE, REQUEST_PAUSE))
      .addAction(0, "Stop", service(VoiceService.ACTION_STOP, REQUEST_STOP))
      .build()
  }

  private fun base(title: String, text: String): NotificationCompat.Builder {
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, REQUEST_OPEN, it, PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(context, LISTENING_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(open)
  }

  private fun service(action: String, request: Int): PendingIntent =
    PendingIntent.getService(
      context,
      request,
      Intent(context, VoiceService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  /** Replaces the ongoing notification (same id as the foreground one). */
  fun update(notification: Notification) {
    try {
      NotificationManagerCompat.from(context).notify(LISTENING_NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS revoked.
    }
  }

  /** A quiet note that an English speech model is being fetched for offline use. */
  fun speechDownloading() {
    val notification = NotificationCompat.Builder(context, LISTENING_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("Clovie")
      .setContentText("Clovie is downloading English speech for offline use")
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setSilent(true)
      .setAutoCancel(true)
      .setTimeoutAfter(120_000L)
      .build()
    try {
      NotificationManagerCompat.from(context).notify(SPEECH_DOWNLOAD_NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS revoked.
    }
  }

  /** The app deep link (scheme://voice?text=...) for a spoken command. */
  fun deepLink(transcript: String): Intent {
    val uri = Uri.Builder()
      .scheme(config.scheme)
      .authority("voice")
      .appendQueryParameter("text", transcript)
      .build()
    return Intent(Intent.ACTION_VIEW, uri)
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  /**
   * The fallback when the overlay cannot be shown (no "Display over other apps"): a heads-up
   * notification with the result. With openWith set, tapping it opens the app on that command;
   * a tap is a user gesture, so Android allows the launch.
   */
  fun result(title: String, text: String, openWith: String?) {
    val builder = NotificationCompat.Builder(context, RESULT_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(title)
      .setContentText(text)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
    if (openWith != null) {
      builder.setContentIntent(
        PendingIntent.getActivity(
          context, REQUEST_RESULT, deepLink(openWith), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        ),
      )
    }
    try {
      NotificationManagerCompat.from(context).notify(RESULT_NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS revoked: nothing more can be shown.
    }
  }

  /**
   * Android would not let the microphone service start in the background (boot, alarm). A tap is a
   * user gesture, so it starts hands-free from the transparent activity.
   */
  fun readyToStart() {
    createChannels()
    val start = PendingIntent.getActivity(
      context,
      REQUEST_READY,
      Intent(context, VoiceTalkActivity::class.java)
        .putExtra(VoiceTalkActivity.EXTRA_HANDS_FREE, true)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = NotificationCompat.Builder(context, RESULT_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("Clovie is ready for opening hours")
      .setContentText("Tap to start listening.")
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(start)
      .build()
    try {
      NotificationManagerCompat.from(context).notify(READY_NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS revoked.
    }
  }

  fun clearReady() {
    NotificationManagerCompat.from(context).cancel(READY_NOTIFICATION_ID)
  }

  companion object {
    const val LISTENING_NOTIFICATION_ID = 4101
    private const val RESULT_NOTIFICATION_ID = 4102
    private const val READY_NOTIFICATION_ID = 4103
    private const val SPEECH_DOWNLOAD_NOTIFICATION_ID = 4104
    private const val LISTENING_CHANNEL = "clovie_voice_listening"
    private const val RESULT_CHANNEL = "clovie_voice_result"
    private const val REQUEST_STOP = 1
    private const val REQUEST_OPEN = 2
    private const val REQUEST_RESULT = 3
    private const val REQUEST_PAUSE = 4
    private const val REQUEST_READY = 5
  }
}
