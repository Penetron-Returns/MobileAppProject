package expo.modules.clovievoice

/**
 * Decides when the owner has finished speaking, from the recogniser's partial transcripts and its microphone level,
 * so a command can go out on the last stable partial instead of waiting for the recogniser's own (long) timeout.
 * Google's recogniser may ignore the silence extras; this does not depend on them. Pure: times are passed in.
 *
 * Speech is "voiced" when the level is [VOICE_MARGIN_DB] above a noise floor that follows the quietest level seen
 * (and creeps up slowly during non-voiced audio). The utterance is complete when there is a non-blank partial, the
 * last voiced level was at least [silenceMs] ago, and the partial text has not changed for [silenceMs] either.
 */
class EndpointTracker(private val silenceMs: Long = SILENCE_MS) {
  private var floorDb = Float.NaN
  private var lastVoicedAt = UNSET
  private var lastChangeAt = UNSET

  /** The latest partial transcript (empty before any). Never logged. */
  var text: String = ""
    private set

  fun reset() {
    floorDb = Float.NaN
    lastVoicedAt = UNSET
    lastChangeAt = UNSET
    text = ""
  }

  fun onRms(db: Float, nowMs: Long) {
    if (floorDb.isNaN() || db < floorDb) floorDb = db
    val isVoiced = db > floorDb + VOICE_MARGIN_DB
    if (isVoiced) lastVoicedAt = nowMs else floorDb += FLOOR_RISE * (db - floorDb)
  }

  fun onPartial(partial: String, nowMs: Long) {
    if (partial == text) return
    text = partial
    lastChangeAt = nowMs
  }

  /** True once speech has clearly ended and the words are stable: finish with [text]. */
  fun shouldFinalize(nowMs: Long): Boolean =
    text.isNotBlank() &&
      lastVoicedAt != UNSET &&
      nowMs - lastVoicedAt >= silenceMs &&
      nowMs - lastChangeAt >= silenceMs

  companion object {
    /** Silence and text stability needed before finalizing on a partial. */
    const val SILENCE_MS = 400L
    const val VOICE_MARGIN_DB = 4f
    private const val FLOOR_RISE = 0.02f
    private const val UNSET = Long.MIN_VALUE
  }
}
