package expo.modules.clovievoice

import android.os.SystemClock
import android.util.Log

/**
 * Latency of the last voice interaction, in ms, for tuning. Logged to logcat (tag `ClovieVoice`)
 * and readable from JS. No transcripts or names are ever logged.
 */
object VoiceTimings {
  private const val TAG = "ClovieVoice"

  @Volatile
  var last: Map<String, Long?> = emptyMap()
    private set

  private var wakeAt = 0L
  private var sttStartAt = 0L
  private var commandStartAt = 0L
  private var values = HashMap<String, Long?>()

  fun wake() {
    wakeAt = SystemClock.elapsedRealtime()
    values = HashMap()
  }

  /** Wake word detected to the overlay window being on screen (null: no overlay permission). */
  fun overlayShown() = record("wakeToOverlayMs", SystemClock.elapsedRealtime() - wakeAt)

  fun sttStarted() {
    sttStartAt = SystemClock.elapsedRealtime()
    record("wakeToSttStartMs", sttStartAt - wakeAt)
  }

  fun sttFinished() = record("sttMs", SystemClock.elapsedRealtime() - sttStartAt)

  fun commandStarted() {
    commandStartAt = SystemClock.elapsedRealtime()
  }

  fun commandDone() {
    record("commandMs", SystemClock.elapsedRealtime() - commandStartAt)
    record("totalMs", SystemClock.elapsedRealtime() - wakeAt)
  }

  private fun record(key: String, ms: Long) {
    values[key] = ms
    last = HashMap(values)
    Log.i(TAG, "timing $key=$ms")
  }
}
