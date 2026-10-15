package expo.modules.clovievoice

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object DutyState {
  const val ON_DUTY = "on_duty"
  const val OFF_HOURS = "off_hours"
  const val WAITING_CHARGER = "waiting_charger"
  const val PAUSED = "paused"
  const val STOPPED = "stopped"
}

/** Whether hands-free should be listening, and until when that is true (or false). */
data class Duty(val state: String, val untilMs: Long?)

/** An opening window in epoch ms: [start, end). */
data class DutyWindow(val start: Long, val end: Long)

/**
 * Hands-free settings and the rule for "should the microphone be open now". The app (JS) pushes the
 * opening windows for the next two weeks, computed from the business hours and special days in the
 * business timezone; the service, the alarm receiver and the boot receiver read them from here, so
 * they work with the app closed. Mirrors `evaluateDuty` in src/features/voice/duty.ts.
 */
class HandsFreePolicy(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences("clovie_voice", Context.MODE_PRIVATE)

  var isEnabled: Boolean
    get() = prefs.getBoolean("hf_enabled", false)
    set(value) = prefs.edit().putBoolean("hf_enabled", value).apply()

  var useOpeningHours: Boolean
    get() = prefs.getBoolean("hf_hours", true)
    set(value) = prefs.edit().putBoolean("hf_hours", value).apply()

  var onlyWhileCharging: Boolean
    get() = prefs.getBoolean("hf_charging", false)
    set(value) = prefs.edit().putBoolean("hf_charging", value).apply()

  var timezone: String
    get() = prefs.getString("hf_tz", null) ?: TimeZone.getDefault().id
    set(value) = prefs.edit().putString("hf_tz", value).apply()

  var pausedUntil: Long
    get() = prefs.getLong("hf_paused_until", 0L)
    set(value) = prefs.edit().putLong("hf_paused_until", value).apply()

  var windows: List<DutyWindow>
    get() = (prefs.getString("hf_windows", "") ?: "").split(';').mapNotNull {
      val parts = it.split(',')
      val start = parts.getOrNull(0)?.toLongOrNull()
      val end = parts.getOrNull(1)?.toLongOrNull()
      if (start != null && end != null) DutyWindow(start, end) else null
    }
    set(value) = prefs.edit().putString("hf_windows", value.joinToString(";") { "${it.start},${it.end}" }).apply()

  fun evaluate(now: Long, isCharging: Boolean): Duty {
    if (!isEnabled) return Duty(DutyState.STOPPED, null)
    if (now < pausedUntil) return Duty(DutyState.PAUSED, pausedUntil)
    val all = windows
    val current = if (useOpeningHours) all.firstOrNull { now >= it.start && now < it.end } else null
    if (useOpeningHours && current == null) {
      return Duty(DutyState.OFF_HOURS, all.firstOrNull { it.start > now }?.start)
    }
    if (onlyWhileCharging && !isCharging) return Duty(DutyState.WAITING_CHARGER, null)
    return Duty(DutyState.ON_DUTY, current?.end)
  }

  /** When something time-based changes next (pause ends, opening starts, closing time), or null. */
  fun nextCheckAt(now: Long): Long? {
    if (now < pausedUntil) return pausedUntil
    if (!useOpeningHours) return null
    val all = windows
    return all.firstOrNull { now >= it.start && now < it.end }?.end ?: all.firstOrNull { it.start > now }?.start
  }

  /** "08:00", or "Mon 08:00" when it is not today, in the business timezone. */
  fun describeTime(ms: Long, now: Long): String {
    val zone = TimeZone.getTimeZone(timezone)
    val day = SimpleDateFormat("yyyyMMdd", Locale.US).apply { timeZone = zone }
    val clock = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = zone }
    val weekday = SimpleDateFormat("EEE", Locale.US).apply { timeZone = zone }
    val at = Date(ms)
    return if (day.format(at) == day.format(Date(now))) clock.format(at) else "${weekday.format(at)} ${clock.format(at)}"
  }
}
