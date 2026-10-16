/**
 * Attendance check planner: pure `plan(inputs, now) -> actions`. The job executor
 * (services/attendanceJob.ts) loads the inputs and carries the actions out.
 *
 * Rules (docs/BUILD_PLAN.md "Attendance check"):
 *  - 10 min after an appointment ends, a still-`confirmed` one gets ONE question, or is silently
 *    completed when it was checked in. Nothing here ever produces `no_show`.
 *  - questions are only created for appointments that ended within CREATE_WINDOW_MINUTES (90).
 *  - staff mode asks the staff member's linked user; owner mode asks the owner(s). Staff questions
 *    are escalated once to the owner(s) when no reachable staff user is linked, or 60 min after
 *    `notified_at` (never `created_at`) without an answer. Escalation needs a reachable owner: with
 *    no devices nothing is sent, so the question stays pending and is not marked escalated.
 *  - at most one push per recipient every 30 min; several open questions become one grouped push.
 *  - pushes only between opening and closing + 1 h (business-local, that day's hours; no hours
 *    row = no restriction). One end-of-day summary at closing + 30 min.
 */
import { DateTime } from 'luxon';

import type { AttendanceMode } from '@booking/types';
import { dateInZone, parseTimeOfDay, wallClockToEpoch, weekdayOf } from '../../lib/time.ts';

export const ASK_DELAY_MINUTES = 10;
/**
 * A question is only created while the appointment ended at most this long ago. Older ones are
 * never backfilled (e.g. after a deploy or an outage): asking "did X make it?" hours later is
 * noise, and they belong in the end-of-day summary / the app's "Needs you" list instead.
 */
export const CREATE_WINDOW_MINUTES = 90;
/** Staff questions escalate to the owner this long after the FIRST SUCCESSFUL push (`notified_at`). */
export const ESCALATE_AFTER_MINUTES = 60;
export const PUSH_GAP_MINUTES = 30;
export const SUMMARY_AFTER_CLOSE_MINUTES = 30;
export const PUSH_UNTIL_AFTER_CLOSE_MINUTES = 60;

const MINUTE = 60_000;

export interface PlanBusiness {
  timezone: string;
  mode: AttendanceMode;
  /** Opening hours (weekday 0 = Sunday, `HH:mm`) */
  hours: { weekday: number; opens_at: string; closes_at: string }[];
  ownerIds: string[];
}

/** A confirmed appointment that ended and has no question yet */
export interface DueAppointment {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  checkedInAt: string | null;
  staffUserId: string | null;
  clientFirstName: string | null;
  serviceName: string;
}

/** An open question whose appointment is still confirmed */
export interface OpenCheck {
  id: string;
  appointmentId: string;
  audience: 'staff' | 'owner';
  recipientUserId: string | null;
  /** When the first push for this question was delivered; null while nobody has been told */
  notifiedAt: string | null;
  escalatedAt: string | null;
  startsAt: string;
  clientFirstName: string | null;
  serviceName: string;
}

export interface PushRecord {
  userId: string;
  kind: 'check' | 'batch' | 'summary';
  checkIds: string[];
  localDate: string;
  sentAt: string;
}

export interface PlanInput {
  now: Date;
  business: PlanBusiness;
  due: DueAppointment[];
  open: OpenCheck[];
  /** Users with at least one registered device */
  reachable: ReadonlySet<string>;
  /** Recent pushes of this business (at least the last 48 h) */
  pushes: PushRecord[];
  newId: () => string;
}

export interface PlannedPush {
  type: 'push';
  userId: string;
  kind: 'check' | 'batch' | 'summary';
  checkIds: string[];
  localDate: string;
  message: { title: string; body: string; categoryId?: string; data: Record<string, string> };
}

export type PlannedAction =
  | { type: 'complete'; appointmentId: string }
  | { type: 'create_check'; checkId: string; appointmentId: string; audience: 'staff' | 'owner'; recipientUserId: string | null }
  | { type: 'escalate'; checkId: string }
  | PlannedPush;

const TITLE = 'Appointment check';

export function firstName(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : 'your client';
}

export function localHm(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: timezone }).toFormat('HH:mm');
}

function checkMessage(c: OpenCheck, timezone: string): PlannedPush['message'] {
  return {
    title: TITLE,
    body: `Did ${firstName(c.clientFirstName)} make it to their ${localHm(c.startsAt, timezone)} ${c.serviceName}?`,
    categoryId: 'attendance_check',
    data: { type: 'attendance_check', checkId: c.id, appointmentId: c.appointmentId },
  };
}

const batchMessage = (count: number): PlannedPush['message'] => ({
  title: TITLE,
  body: `${count} clients to confirm`,
  data: { type: 'attendance_batch', count: String(count) },
});

const summaryMessage = (count: number): PlannedPush['message'] => ({
  title: TITLE,
  body: count === 1 ? '1 appointment still needs confirming' : `${count} appointments still need confirming`,
  data: { type: 'attendance_summary', count: String(count) },
});

/** Opening and closing instants of the business-local day of `now`, or null when it has no hours. */
function todayWindow(input: PlanInput): { open: number; close: number; date: string } | null {
  const { business, now } = input;
  const date = dateInZone(now, business.timezone);
  const row = business.hours.find((h) => h.weekday === weekdayOf(date));
  if (!row) return null;
  return {
    date,
    open: wallClockToEpoch(date, parseTimeOfDay(row.opens_at), business.timezone),
    close: wallClockToEpoch(date, parseTimeOfDay(row.closes_at), business.timezone),
  };
}

interface Working {
  check: OpenCheck;
  /** Recipients of this question right now (escalation adds the owners) */
  recipients: Set<string>;
}

function planDue(input: PlanInput, actions: PlannedAction[]): OpenCheck[] {
  const now = input.now.getTime();
  const asked = new Set(input.open.map((c) => c.appointmentId));
  const created: OpenCheck[] = [];
  const ordered = [...input.due].sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.appointmentId.localeCompare(b.appointmentId));
  for (const d of ordered) {
    if (asked.has(d.appointmentId)) continue;
    const endedAt = Date.parse(d.endsAt);
    if (endedAt + ASK_DELAY_MINUTES * MINUTE > now) continue;
    if (endedAt + CREATE_WINDOW_MINUTES * MINUTE < now) continue; // too late to ask; never backfill
    if (d.checkedInAt) {
      actions.push({ type: 'complete', appointmentId: d.appointmentId });
      continue;
    }
    const audience = input.business.mode;
    const check: OpenCheck = {
      id: input.newId(),
      appointmentId: d.appointmentId,
      audience,
      recipientUserId: audience === 'staff' ? d.staffUserId : null,
      notifiedAt: null,
      escalatedAt: null,
      startsAt: d.startsAt,
      clientFirstName: d.clientFirstName,
      serviceName: d.serviceName,
    };
    actions.push({ type: 'create_check', checkId: check.id, appointmentId: check.appointmentId, audience, recipientUserId: check.recipientUserId });
    created.push(check);
  }
  return created;
}

function shouldEscalate(input: PlanInput, c: OpenCheck): boolean {
  if (c.audience !== 'staff' || c.escalatedAt) return false;
  // Escalating to owners nobody can reach would only mark the question escalated without telling anyone.
  if (!input.business.ownerIds.some((o) => input.reachable.has(o))) return false;
  if (!c.recipientUserId || !input.reachable.has(c.recipientUserId)) return true;
  return c.notifiedAt !== null && input.now.getTime() - Date.parse(c.notifiedAt) >= ESCALATE_AFTER_MINUTES * MINUTE;
}

function resolveRecipients(input: PlanInput, checks: OpenCheck[], actions: PlannedAction[]): Working[] {
  const owners = input.business.ownerIds;
  return checks.map((check) => {
    const recipients = new Set<string>();
    let escalated = check.escalatedAt !== null;
    if (shouldEscalate(input, check)) {
      actions.push({ type: 'escalate', checkId: check.id });
      escalated = true;
    }
    if (check.audience === 'owner' || escalated) owners.forEach((o) => recipients.add(o));
    if (check.audience === 'staff' && check.recipientUserId) recipients.add(check.recipientUserId);
    return { check, recipients };
  });
}

function planPushes(input: PlanInput, work: Working[], actions: PlannedAction[]): void {
  const now = input.now.getTime();
  const tz = input.business.timezone;
  const window = todayWindow(input);
  const date = window?.date ?? dateInZone(input.now, tz);
  const inWindow = !window || (now >= window.open && now <= window.close + PUSH_UNTIL_AFTER_CLOSE_MINUTES * MINUTE);
  const users = [...new Set(work.flatMap((w) => [...w.recipients]))].filter((u) => input.reachable.has(u)).sort();

  for (const userId of users) {
    const mine = work.filter((w) => w.recipients.has(userId)).map((w) => w.check);
    const mineIds = mine.map((c) => c.id);
    const userPushes = input.pushes.filter((p) => p.userId === userId);

    const summaryDue =
      window &&
      inWindow &&
      now >= window.close + SUMMARY_AFTER_CLOSE_MINUTES * MINUTE &&
      !userPushes.some((p) => p.kind === 'summary' && p.localDate === date);
    if (summaryDue) {
      const today = mine.filter((c) => dateInZone(c.startsAt, tz) === date);
      if (today.length > 0) {
        actions.push({ type: 'push', userId, kind: 'summary', checkIds: today.map((c) => c.id), localDate: date, message: summaryMessage(today.length) });
        continue;
      }
    }

    const notified = new Set(userPushes.flatMap((p) => p.checkIds));
    const hasFresh = mineIds.some((id) => !notified.has(id));
    const lastPush = userPushes.reduce((max, p) => Math.max(max, Date.parse(p.sentAt)), 0);
    if (!hasFresh || !inWindow || now - lastPush < PUSH_GAP_MINUTES * MINUTE) continue;

    const only = mine.length === 1 ? mine[0]! : null;
    actions.push({
      type: 'push',
      userId,
      kind: only ? 'check' : 'batch',
      checkIds: mineIds,
      localDate: date,
      message: only ? checkMessage(only, tz) : batchMessage(mine.length),
    });
  }
}

/** Decides everything one business needs this run. Deterministic for fixed inputs. */
export function planAttendance(input: PlanInput): PlannedAction[] {
  const actions: PlannedAction[] = [];
  const created = planDue(input, actions);
  const open = [...input.open, ...created].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  const work = resolveRecipients(input, open, actions);
  planPushes(input, work, actions);
  return actions;
}
