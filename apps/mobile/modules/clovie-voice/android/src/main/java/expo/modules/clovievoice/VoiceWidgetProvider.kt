package expo.modules.clovievoice

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** The 1x1 home-screen Clovie button: a tap starts one-shot listening. */
class VoiceWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val open = PendingIntent.getActivity(
      context,
      0,
      Intent(context, VoiceTalkActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.clovie_voice_widget)
      views.setOnClickPendingIntent(R.id.clovie_widget_root, open)
      manager.updateAppWidget(id, views)
    }
  }
}
