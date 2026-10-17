package expo.modules.clovievoice

import org.json.JSONObject

/**
 * Builds a [CommandOutcome] from the follow-up fields JS sends as one JSON string
 * (`completeCommandWithReply`): `spoken`, `expectsReply`, `pendingApprovalId`, `pendingKind`, `pendingTitle`, `pendingQueue`,
 * `pendingRemaining`, `pendingActionId`, `undoUntilMs`. Anything missing or malformed leaves that field at its default, so a bad string still
 * delivers the plain outcome.
 */
fun commandOutcomeWithReply(status: String, message: String, transcript: String, extrasJson: String): CommandOutcome {
  val extras = try {
    JSONObject(extrasJson)
  } catch (_: Exception) {
    JSONObject()
  }
  return CommandOutcome(
    status = status,
    message = message,
    transcript = transcript,
    spoken = extras.optString("spoken", ""),
    expectsReply = extras.optBoolean("expectsReply", false),
    pendingApprovalId = extras.optString("pendingApprovalId", ""),
    pendingKind = extras.optString("pendingKind", ""),
    pendingTitle = extras.optString("pendingTitle", ""),
    pendingQueue = extras.optString("pendingQueue", ""),
    pendingRemaining = extras.optInt("pendingRemaining", 0),
    pendingActionId = extras.optString("pendingActionId", ""),
    undoUntilMs = extras.optLong("undoUntilMs", 0L),
  )
}
