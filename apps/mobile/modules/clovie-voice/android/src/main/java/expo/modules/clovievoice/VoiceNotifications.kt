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

/** Everything the voice service shows: the "listening" notification and the hand-off to the app. */
class VoiceNotifications(private val context: Context, private val config: VoiceConfig) {

  fun createChannels() {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(LISTENING_CHANNEL, "Hey Clovie listening", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while Clovie waits for the wake word."
        setShowBadge(false)
      },
    )
    manager.createNotificationChannel(
      NotificationChannel(RESULT_CHANNEL, "Hey Clovie commands", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Opens Clovie when a spoken command needs the app."
      },
    )
  }

  fun listening(): Notification {
    val stop = PendingIntent.getService(
      context,
      REQUEST_STOP,
      Intent(context, VoiceService::class.java).setAction(VoiceService.ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, REQUEST_OPEN, it, PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(context, LISTENING_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("Clovie is listening")
      .setContentText("Say \"${config.wakePhrase}\" to give a command.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(open)
      .addAction(0, "Stop", stop)
      .build()
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

  companion object {
    const val LISTENING_NOTIFICATION_ID = 4101
    private const val RESULT_NOTIFICATION_ID = 4102
    private const val LISTENING_CHANNEL = "clovie_voice_listening"
    private const val RESULT_CHANNEL = "clovie_voice_result"
    private const val REQUEST_STOP = 1
    private const val REQUEST_OPEN = 2
    private const val REQUEST_RESULT = 3
  }
}
