/**
 * In-memory AttendanceRepository over the memory booking tables (see bookingMemoryRepository.ts).
 * Mirrors the Supabase implementation: unique question per appointment, conditional writes that
 * report whether they changed a row, business-scoped reads, oldest-first ordering.
 */
import { rangeBounds } from '@booking/features/lib/time.ts';
import type {
  AttendanceBusinessContext,
  AttendanceCheckRow,
  AttendanceDueRow,
  AttendancePushRow,
  AttendanceRepository,
} from '@booking/features/attendance/ports.ts';
import type { MemoryTables } from './bookingMemoryRepository.ts';

type StoredCheck = Omit<AttendanceCheckRow, 'appointment_status' | 'starts_at' | 'ends_at' | 'client_name' | 'service_name'>;

export interface MemoryAttendance extends AttendanceRepository {
  checks: StoredCheck[];
  pushes: (AttendancePushRow & { businessId: string })[];
}

export function createMemoryAttendanceRepository(tables: MemoryTables, clock: () => Date): MemoryAttendance {
  const checks: StoredCheck[] = [];
  const pushes: MemoryAttendance['pushes'] = [];

  const detail = (c: StoredCheck): AttendanceCheckRow => {
    const a = tables.appointments.find((x) => x.id === c.appointment_id)!;
    const bounds = rangeBounds(a.slot);
    return {
      ...c,
      appointment_status: a.status,
      starts_at: bounds.start,
      ends_at: bounds.end,
      client_name: tables.clients.find((x) => x.id === a.client_id)?.name ?? null,
      service_name: tables.services.find((x) => x.id === a.service_id)?.name ?? 'appointment',
    };
  };
  const oldestFirst = (a: StoredCheck, b: StoredCheck) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

  return {
    checks,
    pushes,

    async listDueAppointments({ endedBefore, endedAfter, limit }) {
      const out: AttendanceDueRow[] = [];
      for (const a of tables.appointments) {
        const { start, end } = rangeBounds(a.slot);
        if (a.status !== 'confirmed' || Date.parse(end) > Date.parse(endedBefore) || Date.parse(end) <= Date.parse(endedAfter)) continue;
        if (checks.some((c) => c.appointment_id === a.id)) continue;
        out.push({
          business_id: a.business_id,
          appointment_id: a.id,
          starts_at: start,
          ends_at: end,
          checked_in_at: a.checked_in_at,
          staff_user_id: tables.staff.find((s) => s.id === a.staff_id)?.user_id ?? null,
          client_name: tables.clients.find((c) => c.id === a.client_id)?.name ?? null,
          service_name: tables.services.find((s) => s.id === a.service_id)?.name ?? 'appointment',
        });
      }
      return out.sort((x, y) => x.ends_at.localeCompare(y.ends_at) || x.appointment_id.localeCompare(y.appointment_id)).slice(0, limit);
    },

    async listPendingChecks(limit) {
      return checks.filter((c) => c.status === 'pending').sort(oldestFirst).slice(0, limit).map(detail);
    },
    async listPendingChecksForBusiness(businessId) {
      return checks.filter((c) => c.business_id === businessId && c.status === 'pending').sort(oldestFirst).map(detail);
    },
    async getCheck(businessId, checkId) {
      const c = checks.find((x) => x.business_id === businessId && x.id === checkId);
      return c ? detail(c) : null;
    },

    async insertCheck(c) {
      if (checks.some((x) => x.appointment_id === c.appointmentId)) return false;
      checks.push({
        id: c.id,
        business_id: c.businessId,
        appointment_id: c.appointmentId,
        audience: c.audience,
        recipient_user_id: c.recipientUserId,
        status: 'pending',
        outcome: null,
        created_at: c.createdAt,
        notified_at: null,
        escalated_at: null,
        answered_at: null,
        answered_by: null,
      });
      return true;
    },
    async markEscalated(businessId, checkId, at) {
      const c = checks.find((x) => x.business_id === businessId && x.id === checkId);
      if (!c || c.status !== 'pending' || c.escalated_at) return false;
      c.escalated_at = at;
      return true;
    },
    async markNotified(businessId, checkIds, at) {
      for (const c of checks) if (c.business_id === businessId && checkIds.includes(c.id) && !c.notified_at) c.notified_at = at;
    },
    async answerCheck(a) {
      const c = checks.find((x) => x.business_id === a.businessId && x.id === a.checkId);
      if (!c || c.status !== 'pending') return false;
      Object.assign(c, { status: 'answered', outcome: a.outcome, answered_by: a.answeredBy, answered_at: a.at });
      return true;
    },

    async getBusinessContext(businessId): Promise<AttendanceBusinessContext | null> {
      const b = tables.businesses.find((x) => x.id === businessId);
      if (!b) return null;
      return {
        timezone: b.timezone,
        mode: b.attendance_mode,
        hours: tables.business_hours
          .filter((h) => h.business_id === businessId)
          .map((h) => ({ weekday: h.weekday, opens_at: h.opens_at, closes_at: h.closes_at })),
        ownerIds: tables.users.filter((u) => u.business_id === businessId && u.role === 'owner').map((u) => u.id).sort(),
      };
    },
    async listDeviceTokens(businessId, userIds) {
      return tables.device_push_tokens
        .filter((d) => d.business_id === businessId && userIds.includes(d.user_id))
        .map((d) => ({ userId: d.user_id, token: d.token }));
    },
    async listPushes(businessId, sinceIso) {
      return pushes.filter((p) => p.businessId === businessId && Date.parse(p.sentAt) >= Date.parse(sinceIso));
    },
    async recordPush(businessId, p) {
      pushes.push({ ...p, businessId });
    },
  };
}
