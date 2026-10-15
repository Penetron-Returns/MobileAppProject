package expo.modules.clovievoice

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** The "Talk to Clovie" Quick Settings tile: one tap opens the overlay and starts listening. */
class VoiceTileService : TileService() {
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      label = getString(R.string.clovie_talk_label)
      updateTile()
    }
  }

  override fun onClick() {
    if (isLocked) unlockAndRun { launch() } else launch()
  }

  private fun launch() {
    val intent = Intent(this, VoiceTalkActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    // startActivityAndCollapse closes the shade, then the transparent activity starts the service.
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
