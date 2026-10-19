package expo.modules.clovievoice

import android.os.SystemClock
import android.util.Log

/**
 * Latency of one voice interaction, in ms, from a single monotonic clock. A value for a step that
 * did not happen (no overlay, STT never started, no command ran) is -1. Pure apart from the injected
 * clock and sink, so it is unit tested.
 */
class TimingRecorder(
  private val clock: () -> Long,
  private val wallClock: () -> Long = System::currentTimeMillis,
  private val sink: (String, Long) -> Unit,
) {
  var values: Map<String, Long> = emptyMap()
    private set

  private var wakeAt = UNSET
  private var sttStartAt = UNSET
  private var commandStartAt = UNSET
  private var clipEndAt = UNSET
  private var uploadStartAt = UNSET
  private var speechEndAt = UNSET
  private var speechEndWall = UNSET
  private var finalAt = UNSET
  private var ttsAt = UNSET
  private var interimAt = UNSET
  private var requestSentWall = UNSET
  private var firstByteWall = UNSET
  private var isLatencyReported = false
  private val current = HashMap<String, Long>()

  @Synchronized
  fun wake() {
    wakeAt = clock()
    sttStartAt = UNSET
    commandStartAt = UNSET
    clipEndAt = UNSET
    uploadStartAt = UNSET
    resetTurn()
    current.clear()
    values = emptyMap()
  }

  /** A new listen (the first, or a follow-up): the end-of-speech marks start over. */
  @Synchronized
  fun resetTurn() {
    speechEndAt = UNSET
    speechEndWall = UNSET
    finalAt = UNSET
    ttsAt = UNSET
    interimAt = UNSET
    requestSentWall = UNSET
    firstByteWall = UNSET
    isLatencyReported = false
  }

  /** The owner stopped speaking (recogniser, endpointer or VAD): the zero of the latency the owner feels. First call wins. */
  @Synchronized
  fun speechEnded() {
    if (speechEndAt != UNSET) return
    speechEndAt = clock()
    speechEndWall = wallClock()
  }

  @Synchronized
  fun finalTranscript() {
    if (speechEndAt == UNSET) speechEnded()
    if (finalAt == UNSET) finalAt = clock()
  }

  @Synchronized
  fun ttsStarted() {
    if (ttsAt == UNSET) ttsAt = clock()
  }

  /** The short filler ("One sec") began: usually the first word the owner hears after speaking. */
  @Synchronized
  fun interimStarted() {
    if (interimAt == UNSET) interimAt = clock()
  }

  /**
   * Whole milliseconds after the end of speech for each step that happened (a missing step is left out), or null when
   * there is nothing to report or it was already reported this turn. The request and first reply byte are stamped by
   * the app's JS in wall-clock ms, so they are converted against the wall-clock time of the speech end.
   * Numbers only: never a transcript or a name.
   */
  @Synchronized
  fun latencyOffsets(): Map<String, Long>? {
    if (speechEndAt == UNSET || isLatencyReported) return null
    isLatencyReported = true
    val out = LinkedHashMap<String, Long>()
    if (finalAt != UNSET) out["finalTranscriptMs"] = maxOf(0L, finalAt - speechEndAt)
    if (requestSentWall != UNSET) out["requestSentMs"] = maxOf(0L, requestSentWall - speechEndWall)
    if (firstByteWall != UNSET) out["firstReplyByteMs"] = maxOf(0L, firstByteWall - speechEndWall)
    if (interimAt != UNSET) out["interimStartMs"] = maxOf(0L, interimAt - speechEndAt)
    if (ttsAt != UNSET) out["ttsStartMs"] = maxOf(0L, ttsAt - speechEndAt)
    return out
  }

  /** Wall-clock stamps from the app's JS (see [VoiceTimings.EXTERNAL_KEYS]). */
  @Synchronized
  fun wallMark(key: String, epochMs: Long) {
    if (key == "requestSentAt") requestSentWall = epochMs else firstByteWall = epochMs
  }

  /** Wake word detected to the overlay window being on screen. */
  fun overlayShown() = record("wakeToOverlayMs", since(wakeAt))

  fun sttStarted() {
    sttStartAt = clock()
    record("wakeToSttStartMs", since(wakeAt))
  }

  fun sttFinished() = record("sttMs", since(sttStartAt))

  /** The VAD ended the clip: the start of the post-speech latency the owner waits through. */
  @Synchronized
  fun clipEnded() {
    clipEndAt = clock()
  }

  /** Clip end to the file being ready to send (the encode), and its size. */
  fun encoded(bytes: Long) {
    record("encodeMs", since(clipEndAt))
    record("clipBytes", bytes)
  }

  /** The upload is about to start: clip end to now, and the request body size. */
  @Synchronized
  fun uploadStarted(bytes: Long) {
    uploadStartAt = clock()
    record("uploadStartMs", since(clipEndAt))
    record("uploadBytes", bytes)
  }

  /**
   * The response is in. `proxyMs` and `nerovaMs` come from our API's `Server-Timing` header (null when absent), so
   * `networkMs` (round trip minus the proxy's total) and `proxyOverheadMs` (the proxy minus Nerova) show where the rest went.
   */
  @Synchronized
  fun uploadFinished(timing: ServerTiming) {
    val roundTrip = since(uploadStartAt)
    record("responseMs", since(clipEndAt))
    record("uploadMs", roundTrip)
    timing.proxyMs?.let {
      record("proxyMs", it)
      if (roundTrip >= 0) record("networkMs", maxOf(0L, roundTrip - it))
    }
    timing.authMs?.let { record("authMs", it) }
    timing.nerovaMs?.let {
      record("nerovaMs", it)
      timing.proxyMs?.let { proxy -> record("proxyOverheadMs", maxOf(0L, proxy - it)) }
    }
  }

  /** A step measured elsewhere (the connection warm-up, the app's JS): logged and kept with the rest. */
  fun external(key: String, ms: Long) = record(key, ms)

  @Synchronized
  fun commandStarted() {
    commandStartAt = clock()
  }

  fun commandDone() {
    record("commandMs", since(commandStartAt))
    record("totalMs", since(wakeAt))
  }

  private fun since(start: Long): Long = if (start == UNSET) -1L else maxOf(0L, clock() - start)

  @Synchronized
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

  fun resetTurn() = recorder.resetTurn()

  fun speechEnded() = recorder.speechEnded()

  fun finalTranscript() = recorder.finalTranscript()

  fun ttsStarted() = recorder.ttsStarted()

  fun interimStarted() = recorder.interimStarted()

  /** The offsets for the turn's latency event, once; see [TimingRecorder.latencyOffsets]. */
  fun latencyOffsets(): Map<String, Long>? = recorder.latencyOffsets()

  fun overlayShown() = recorder.overlayShown()

  fun sttStarted() = recorder.sttStarted()

  fun sttFinished() = recorder.sttFinished()

  fun commandStarted() = recorder.commandStarted()

  fun commandDone() = recorder.commandDone()

  fun clipEnded() = recorder.clipEnded()

  fun encoded(bytes: Long) = recorder.encoded(bytes)

  fun uploadStarted(bytes: Long) = recorder.uploadStarted(bytes)

  fun uploadFinished(timing: ServerTiming) = recorder.uploadFinished(timing)

  /** Timings the app's JS reports (see [EXTERNAL_KEYS]); anything else is ignored so the log stays a fixed vocabulary. */
  fun external(key: String, ms: Long) {
    when (key) {
      "requestSentAt", "firstReplyByteAt" -> recorder.wallMark(key, ms)
      in EXTERNAL_KEYS -> recorder.external(key, ms)
    }
  }

  val EXTERNAL_KEYS = setOf("headlessStartMs", "todayMs", "todayPrefetched", "pingMs", "askMs")
}
