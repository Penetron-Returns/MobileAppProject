/**
 * Supabase implementation of AttendanceRepository. The service-role client bypasses RLS, so every
 * query is scoped by business_id; the two cron scans (due appointments, all pending questions)
 * are the documented global exceptions.
 */
import type { AppointmentStatus } from '@booking/types';
import type { Db } from '../../lib/db.ts';
import { mapDbError } from '../../lib/errors.ts';
import { toIsoInstant } from '../../lib/time.ts';
import { check, maybe, rows } from '../../repositories/dbResult.ts';
import type {
  AttendanceBusinessContext,
  AttendanceCheckRow,
  AttendanceDueRow,
  AttendancePushRow,
  AttendanceRepository,
} from '../ports.ts';

const CHECK_COLS =
  'id, business_id, appointment_id, audience, recipient_user_id, status, outcome, created_at, notified_at, escalated_at, answered_at, answered_by';

type CheckBase = Omit<AttendanceCheckRow, 'appointment_status' | 'starts_at' | 'ends_at' | 'client_name' | 'service_name'>;

const iso = (v: string | null) => (v === null ? null : toIsoInstant(v));

/** PostgREST encodes `in` filters in the URL, so long id lists are fetched in slices. */
const ID_SLICE = 100;
async function inSlices<T>(ids: string[], fetchSlice: (slice: string[]) => PromiseLike<{ data: unknown; error: Parameters<typeof mapDbError>[0] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_SLICE) out.push(...rows<T>(await fetchSlice(ids.slice(i, i + ID_SLICE))));
  return out;
}

export function createSupabaseAttendanceRepository(db: Db): AttendanceRepository {
  /** Joins appointment, client and service details onto checks (grouped per business). */
  async function withDetails(checks: CheckBase[]): Promise<AttendanceCheckRow[]> {
    if (checks.length === 0) return [];
    const businessIds = [...new Set(checks.map((c) => c.business_id))];
    const appointmentIds = checks.map((c) => c.appointment_id);
    const appointments = await inSlices<{
      id: string;
      client_id: string;
      service_id: string;
      status: AppointmentStatus;
      starts_at: string;
      ends_at: string;
    }>(appointmentIds, (slice) =>
      db
        .from('appointments')
        .select('id, client_id, service_id, status, starts_at, ends_at')
        .in('business_id', businessIds)
        .in('id', slice),
    );
    const clientIds = [...new Set(appointments.map((a) => a.client_id))];
    const serviceIds = [...new Set(appointments.map((a) => a.service_id))];
    const [clients, services] = await Promise.all([
      inSlices<{ id: string; name: string | null }>(clientIds, (slice) =>
        db.from('clients').select('id, name').in('business_id', businessIds).in('id', slice),
      ),
      inSlices<{ id: string; name: string }>(serviceIds, (slice) =>
        db.from('services').select('id, name').in('business_id', businessIds).in('id', slice),
      ),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const serviceName = new Map(services.map((s) => [s.id, s.name]));
    const byId = new Map(appointments.map((a) => [a.id, a]));
    return checks.flatMap((c) => {
      const a = byId.get(c.appointment_id);
      if (!a) return [];
      return [
        {
          ...c,
          created_at: toIsoInstant(c.created_at),
          notified_at: iso(c.notified_at),
          escalated_at: iso(c.escalated_at),
          answered_at: iso(c.answered_at),
          appointment_status: a.status,
          starts_at: toIsoInstant(a.starts_at),
          ends_at: toIsoInstant(a.ends_at),
          client_name: clientName.get(a.client_id) ?? null,
          service_name: serviceName.get(a.service_id) ?? 'appointment',
        },
      ];
    });
  }

  return {
    async listDueAppointments(args) {
      const data = rows<AttendanceDueRow>(
        await db.rpc('attendance_due_appointments', {
          p_ended_before: args.endedBefore,
          p_ended_after: args.endedAfter,
          p_limit: args.limit,
        }),
      );
      return data.map((r) => ({ ...r, starts_at: toIsoInstant(r.starts_at), ends_at: toIsoInstant(r.ends_at), checked_in_at: iso(r.checked_in_at) }));
    },

    async listPendingChecks(limit) {
      const checks = rows<CheckBase>(
        await db.from('attendance_checks').select(CHECK_COLS).eq('status', 'pending').order('created_at').order('id').limit(limit),
      );
      return withDetails(checks);
    },

    async listPendingChecksForBusiness(businessId) {
      const checks = rows<CheckBase>(
        await db.from('attendance_checks').select(CHECK_COLS).eq('business_id', businessId).eq('status', 'pending').order('created_at').order('id'),
      );
      return withDetails(checks);
    },

    async getCheck(businessId, checkId) {
      const base = maybe<CheckBase>(
        await db.from('attendance_checks').select(CHECK_COLS).eq('business_id', businessId).eq('id', checkId).maybeSingle(),
      );
      return base ? ((await withDetails([base]))[0] ?? null) : null;
    },

    async insertCheck(c) {
      const res = await db
        .from('attendance_checks')
        .upsert(
          { id: c.id, created_at: c.createdAt, business_id: c.businessId, appointment_id: c.appointmentId, audience: c.audience, recipient_user_id: c.recipientUserId },
          { onConflict: 'appointment_id', ignoreDuplicates: true },
        )
        .select('id');
      if (res.error) throw mapDbError(res.error);
      return (res.data ?? []).length > 0;
    },

    async markEscalated(businessId, checkId, at) {
      const res = await db
        .from('attendance_checks')
        .update({ escalated_at: at })
        .eq('business_id', businessId)
        .eq('id', checkId)
        .eq('status', 'pending')
        .is('escalated_at', null)
        .select('id');
      if (res.error) throw mapDbError(res.error);
      return (res.data ?? []).length > 0;
    },

    async markNotified(businessId, checkIds, at) {
      if (checkIds.length === 0) return;
      check(await db.from('attendance_checks').update({ notified_at: at }).eq('business_id', businessId).in('id', checkIds).is('notified_at', null));
    },

    async answerCheck(a) {
      const res = await db
        .from('attendance_checks')
        .update({ status: 'answered', outcome: a.outcome, answered_by: a.answeredBy, answered_at: a.at })
        .eq('business_id', a.businessId)
        .eq('id', a.checkId)
        .eq('status', 'pending')
        .select('id');
      if (res.error) throw mapDbError(res.error);
      return (res.data ?? []).length > 0;
    },

    async getBusinessContext(businessId): Promise<AttendanceBusinessContext | null> {
      const business = maybe<{ timezone: string; attendance_mode: 'staff' | 'owner' }>(
        await db.from('businesses').select('timezone, attendance_mode').eq('id', businessId).maybeSingle(),
      );
      if (!business) return null;
      const [hours, owners] = await Promise.all([
        db.from('business_hours').select('weekday, opens_at, closes_at').eq('business_id', businessId),
        db.from('users').select('id').eq('business_id', businessId).eq('role', 'owner'),
      ]);
      return {
        timezone: business.timezone,
        mode: business.attendance_mode,
        hours: rows<{ weekday: number; opens_at: string; closes_at: string }>(hours),
        ownerIds: rows<{ id: string }>(owners).map((o) => o.id).sort(),
      };
    },

    async listDeviceTokens(businessId, userIds) {
      if (userIds.length === 0) return [];
      const data = rows<{ user_id: string; token: string }>(
        await db.from('device_push_tokens').select('user_id, token').eq('business_id', businessId).in('user_id', userIds),
      );
      return data.map((d) => ({ userId: d.user_id, token: d.token }));
    },

    async listPushes(businessId, sinceIso) {
      const data = rows<{ user_id: string; kind: AttendancePushRow['kind']; check_ids: string[]; local_date: string; sent_at: string }>(
        await db
          .from('attendance_pushes')
          .select('user_id, kind, check_ids, local_date, sent_at')
          .eq('business_id', businessId)
          .gte('sent_at', sinceIso),
      );
      return data.map((p) => ({ userId: p.user_id, kind: p.kind, checkIds: p.check_ids, localDate: p.local_date, sentAt: toIsoInstant(p.sent_at) }));
    },

    async recordPush(businessId, p) {
      check(
        await db.from('attendance_pushes').insert({
          business_id: businessId,
          user_id: p.userId,
          kind: p.kind,
          check_ids: p.checkIds,
          local_date: p.localDate,
          sent_at: p.sentAt,
        }),
      );
    },
  };
}
