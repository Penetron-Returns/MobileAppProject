package expo.modules.clovievoice

import android.os.SystemClock
import android.util.Log

/**
 * Latency of one voice interaction, in ms, from a single monotonic clock. A value for a step that
 * did not happen (no overlay, STT never started, no command ran) is -1. Pure apart from the injected
 * clock and sink, so it is unit tested.
 */
class TimingRecorder(private val clock: () -> Long, private val sink: (String, Long) -> Unit) {
  var values: Map<String, Long> = emptyMap()
    private set

  private var wakeAt = UNSET
  private var sttStartAt = UNSET
  private var commandStartAt = UNSET
  private val current = HashMap<String, Long>()

  fun wake() {
    wakeAt = clock()
    sttStartAt = UNSET
    commandStartAt = UNSET
    current.clear()
    values = emptyMap()
  }

  /** Wake word detected to the overlay window being on screen. */
  fun overlayShown() = record("wakeToOverlayMs", since(wakeAt))

  fun sttStarted() {
    sttStartAt = clock()
    record("wakeToSttStartMs", since(wakeAt))
  }

  fun sttFinished() = record("sttMs", since(sttStartAt))

  fun commandStarted() {
    commandStartAt = clock()
  }

  fun commandDone() {
    record("commandMs", since(commandStartAt))
    record("totalMs", since(wakeAt))
  }

  private fun since(start: Long): Long = if (start == UNSET) -1L else maxOf(0L, clock() - start)

  private fun record(key: String, ms: Long) {
    current[key] = ms
    values = HashMap(current)
    sink(key, ms)
  }

  private companion object {
    const val UNSET = Long.MIN_VALUE
  }
}

/** The process-wide recorder: monotonic clock, logcat tag `ClovieVoice`, never a transcript or name. */
object VoiceTimings {
  private const val TAG = "ClovieVoice"
  private val recorder = TimingRecorder(SystemClock::elapsedRealtime) { key, ms -> Log.i(TAG, "timing $key=$ms") }

  val last: Map<String, Long?>
    get() = recorder.values

  fun wake() = recorder.wake()

  fun overlayShown() = recorder.overlayShown()

  fun sttStarted() = recorder.sttStarted()

  fun sttFinished() = recorder.sttFinished()

  fun commandStarted() = recorder.commandStarted()

  fun commandDone() = recorder.commandDone()
}
