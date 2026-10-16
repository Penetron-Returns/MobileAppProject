/**
 * Attendance cron job (/cron/attendance, every 5 minutes): a thin executor around the pure
 * planner. Per run it closes stale questions, creates due ones, silently completes checked-in
 * appointments, escalates, and sends (batched) pushes and end-of-day summaries.
 * Idempotent and safe to overlap: creation is `insert ... on conflict do nothing`, escalation and
 * answers are conditional updates, and the push log feeds the 30 minute rate limit.
 */
import type { Logger } from '../../lib/logger.ts';
import type { BookingService } from '../../bookings/ports.ts';
import type { Actor } from '../../bookings/ports.ts';
import { AppError } from '../../lib/errors.ts';
import {
  ASK_DELAY_MINUTES,
  CREATE_WINDOW_MINUTES,
  planAttendance,
  type DueAppointment,
  type OpenCheck,
  type PlannedAction,
  type PlannedPush,
} from '../lib/planner.ts';
import type { AttendanceCheckRow, AttendanceDueRow, AttendancePush, AttendanceRepository } from '../ports.ts';

/** Businesses processed at once; bounded so one run cannot open dozens of DB requests. */
const BUSINESS_CONCURRENCY = 5;
const DUE_LIMIT = 300;
const PENDING_LIMIT = 1000;
const PUSH_HISTORY_HOURS = 48;
const SYSTEM: Actor = { type: 'system', id: null };

export interface AttendanceJobDeps {
  repo: AttendanceRepository;
  booking: Pick<BookingService, 'setAppointmentStatus'>;
  push: AttendancePush;
  logger: Logger;
  newId: () => string;
}

type Counts = Record<'created' | 'completed' | 'escalated' | 'pushes' | 'closed' | 'errors', number>;

const toDue = (r: AttendanceDueRow): DueAppointment => ({
  appointmentId: r.appointment_id,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  checkedInAt: r.checked_in_at,
  staffUserId: r.staff_user_id,
  clientFirstName: r.client_name,
  serviceName: r.service_name,
});

const toOpen = (r: AttendanceCheckRow): OpenCheck => ({
  id: r.id,
  appointmentId: r.appointment_id,
  audience: r.audience,
  recipientUserId: r.recipient_user_id,
  notifiedAt: r.notified_at,
  escalatedAt: r.escalated_at,
  startsAt: r.starts_at,
  clientFirstName: r.client_name,
  serviceName: r.service_name,
});

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

export async function runAttendanceJob(deps: AttendanceJobDeps, now: Date): Promise<Record<string, number>> {
  const { repo, logger } = deps;
  const counts: Counts = { created: 0, completed: 0, escalated: 0, pushes: 0, closed: 0, errors: 0 };
  const nowIso = now.toISOString();

  const [dueRows, pendingRows] = await Promise.all([
    repo.listDueAppointments({
      endedBefore: new Date(now.getTime() - ASK_DELAY_MINUTES * 60_000).toISOString(),
      endedAfter: new Date(now.getTime() - CREATE_WINDOW_MINUTES * 60_000).toISOString(),
      limit: DUE_LIMIT,
    }),
    repo.listPendingChecks(PENDING_LIMIT),
  ]);

  // A question whose appointment was completed, cancelled or marked elsewhere is simply closed.
  const stale = pendingRows.filter((r) => r.appointment_status !== 'confirmed');
  const closed = await Promise.all(
    stale.map((row) =>
      repo.answerCheck({ businessId: row.business_id, checkId: row.id, outcome: 'resolved_elsewhere', answeredBy: null, at: nowIso }),
    ),
  );
  counts.closed += closed.filter(Boolean).length;
  const open = pendingRows.filter((r) => r.appointment_status === 'confirmed');

  const dueByBusiness = groupBy(dueRows, (r) => r.business_id);
  const openByBusiness = groupBy(open, (r) => r.business_id);
  const businessIds = [...new Set([...dueByBusiness.keys(), ...openByBusiness.keys()])].sort();

  // Businesses are independent, so run them in bounded parallel batches instead of one by one.
  for (let i = 0; i < businessIds.length; i += BUSINESS_CONCURRENCY) {
    await Promise.all(
      businessIds.slice(i, i + BUSINESS_CONCURRENCY).map(async (businessId) => {
        try {
          await runBusiness(deps, businessId, now, dueByBusiness.get(businessId) ?? [], openByBusiness.get(businessId) ?? [], counts);
        } catch (err) {
          counts.errors += 1;
          logger.error('attendance_business_failed', { business_id: businessId, error: err });
        }
      }),
    );
  }
  return counts;
}

async function runBusiness(
  deps: AttendanceJobDeps,
  businessId: string,
  now: Date,
  due: AttendanceDueRow[],
  open: AttendanceCheckRow[],
  counts: Counts,
): Promise<void> {
  const { repo } = deps;
  const [context, pushes] = await Promise.all([
    repo.getBusinessContext(businessId),
    repo.listPushes(businessId, new Date(now.getTime() - PUSH_HISTORY_HOURS * 3_600_000).toISOString()),
  ]);
  if (!context) return;

  const candidates = new Set<string>(context.ownerIds);
  due.forEach((d) => d.staff_user_id && candidates.add(d.staff_user_id));
  open.forEach((c) => c.recipient_user_id && candidates.add(c.recipient_user_id));
  const devices = await repo.listDeviceTokens(businessId, [...candidates]);

  const actions = planAttendance({
    now,
    business: context,
    due: due.map(toDue),
    open: open.map(toOpen),
    reachable: new Set(devices.map((d) => d.userId)),
    pushes,
    newId: deps.newId,
  });

  const existing = new Set(open.map((c) => c.id));
  const notified = new Set(open.filter((c) => c.notified_at !== null).map((c) => c.id));
  // Pushes first: an escalation is only recorded for a question somebody has actually been told about.
  const ordered = [...actions.filter((a) => a.type !== 'escalate'), ...actions.filter((a) => a.type === 'escalate')];
  for (const action of ordered) {
    try {
      await execute(deps, { businessId, now, existing, notified, counts }, action);
    } catch (err) {
      counts.errors += 1;
      deps.logger.error('attendance_action_failed', { business_id: businessId, action: action.type, error: err });
    }
  }
}

interface RunState {
  businessId: string;
  now: Date;
  /** Stored, still-pending question ids */
  existing: Set<string>;
  /** Question ids somebody has been successfully pushed about (now or earlier) */
  notified: Set<string>;
  counts: Counts;
}

async function execute(deps: AttendanceJobDeps, state: RunState, action: PlannedAction): Promise<void> {
  const { repo } = deps;
  const { businessId, now, existing, notified, counts } = state;
  const nowIso = now.toISOString();
  switch (action.type) {
    case 'complete':
      try {
        await deps.booking.setAppointmentStatus(businessId, action.appointmentId, 'completed', SYSTEM);
        counts.completed += 1;
      } catch (err) {
        // Changed by someone else since the scan: nothing to do.
        if (!(err instanceof AppError) || err.details?.rule !== 'INVALID_STATUS') throw err;
      }
      return;
    case 'create_check':
      if (await repo.insertCheck({ id: action.checkId, createdAt: nowIso, businessId, appointmentId: action.appointmentId, audience: action.audience, recipientUserId: action.recipientUserId })) {
        existing.add(action.checkId);
        counts.created += 1;
      }
      return;
    case 'escalate':
      if (existing.has(action.checkId) && notified.has(action.checkId) && (await repo.markEscalated(businessId, action.checkId, nowIso))) counts.escalated += 1;
      return;
    case 'push':
      await sendPush(deps, state, action);
      return;
  }
}

async function sendPush(deps: AttendanceJobDeps, state: RunState, action: PlannedPush): Promise<void> {
  const { businessId, now, existing, notified, counts } = state;
  // A question that lost the creation race (or was never stored) must not be announced.
  if (!action.checkIds.every((id) => existing.has(id))) return;
  const devices = await deps.push.toUsers(businessId, [action.userId], action.message);
  if (devices === 0) return; // not delivered: retried next run, and the 30 minute gap is not consumed
  const at = now.toISOString();
  await deps.repo.recordPush(businessId, { userId: action.userId, kind: action.kind, checkIds: action.checkIds, localDate: action.localDate, sentAt: at });
  await deps.repo.markNotified(businessId, action.checkIds, at);
  action.checkIds.forEach((id) => notified.add(id));
  counts.pushes += 1;
}
