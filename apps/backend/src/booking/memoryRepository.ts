/**
 * In-memory BookingRepository for tests (ours and WS-C's). It mirrors the
 * RPC contracts in docs/BUILD_PLAN.md §3: SQLSTATE-coded errors, the
 * exclusion constraint on (staff_id, blocked), idempotent create, and the
 * status transitions. Ids are deterministic (counter based).
 */
import type { UUID } from '../../../../packages/shared/api.ts';
import { AppError, mapDbError } from '../lib/errors.ts';
import { rangeBounds } from '../lib/time.ts';
import type { BookingRepository, BusyRow, StaffValues } from './repository.ts';
import {
  DEFAULT_BOOKING_RULES,
  type AppointmentRow,
  type AvailabilityRuleRow,
  type BookingAttemptRow,
  type BusinessHoursDbRow,
  type BusinessRow,
  type ClientNoteRow,
  type ClientRow,
  type OverrideRow,
  type ServiceRow,
  type StaffRow,
  type StaffServiceRow,
  type UserRow,
  type WebhookEventRow,
} from './rows.ts';

export interface MemoryTables {
  businesses: BusinessRow[];
  users: UserRow[];
  staff: StaffRow[];
  services: ServiceRow[];
  staff_services: StaffServiceRow[];
  business_hours: BusinessHoursDbRow[];
  availability_rules: AvailabilityRuleRow[];
  availability_overrides: OverrideRow[];
  clients: ClientRow[];
  client_notes: ClientNoteRow[];
  appointments: AppointmentRow[];
  appointment_events: { appointment_id: UUID; type: string; actor: string; actor_id: string | null; payload: unknown }[];
  booking_attempts: BookingAttemptRow[];
  webhook_events: WebhookEventRow[];
  idempotency_keys: { key: string; expires_at: string }[];
  device_push_tokens: { business_id: UUID; user_id: string; token: string; platform: string }[];
}

export interface MemoryRepository extends BookingRepository {
  tables: MemoryTables;
  /** Deterministic id generator shared by seeds and inserts */
  nextId(): UUID;
}

const pgError = (code: string, message: string) => mapDbError({ code, message });
const rule = (code: string, message: string) => pgError('P0001', `RULE:${code}:${message}`);
const notFound = (entity: string) => pgError('P0002', `${entity} not found`);

const clone = <T>(v: T): T => structuredClone(v);
const toPgRange = (startMs: number, endMs: number) =>
  `["${new Date(startMs).toISOString()}","${new Date(endMs).toISOString()}")`;

function overlaps(a: string, b: string): boolean {
  const x = rangeBounds(a);
  const y = rangeBounds(b);
  return Date.parse(x.start) < Date.parse(y.end) && Date.parse(y.start) < Date.parse(x.end);
}

export function createMemoryRepository(opts: { now?: () => Date } = {}): MemoryRepository {
  const now = () => (opts.now ?? (() => new Date()))().toISOString();
  let seq = 0;
  const nextId = (): UUID => {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  };

  const tables: MemoryTables = {
    businesses: [],
    users: [],
    staff: [],
    services: [],
    staff_services: [],
    business_hours: [],
    availability_rules: [],
    availability_overrides: [],
    clients: [],
    client_notes: [],
    appointments: [],
    appointment_events: [],
    booking_attempts: [],
    webhook_events: [],
    idempotency_keys: [],
    device_push_tokens: [],
  };

  const onboarded = new Set<UUID>();

  const inBusiness = <T extends { business_id: UUID }>(list: T[], businessId: UUID) =>
    list.filter((r) => r.business_id === businessId);
  const find = <T extends { id: UUID; business_id: UUID }>(list: T[], businessId: UUID, id: UUID) =>
    list.find((r) => r.business_id === businessId && r.id === id) ?? null;
  const patchRow = <T extends object>(row: T | null, patch: Partial<NoInfer<T>>): T | null => {
    if (!row) return null;
    Object.assign(row, patch);
    return clone(row);
  };

  function assertUniqueSlug(slug: string, exceptId?: UUID) {
    if (tables.businesses.some((b) => b.slug.toLowerCase() === slug.toLowerCase() && b.id !== exceptId)) {
      throw pgError('23505', 'duplicate key value violates unique constraint "businesses_slug_key"');
    }
  }

  function bufferFor(businessId: UUID): number {
    const b = tables.businesses.find((x) => x.id === businessId);
    return { ...DEFAULT_BOOKING_RULES, ...(b?.booking_rules ?? {}) }.buffer_minutes;
  }

  function assertNoOverlap(staffId: UUID, blocked: string, exceptId?: UUID) {
    const clash = tables.appointments.some(
      (a) => a.staff_id === staffId && a.status !== 'cancelled' && a.id !== exceptId && overlaps(a.blocked, blocked),
    );
    if (clash) throw pgError('23P01', 'conflicting key value violates exclusion constraint');
  }

  function assertBookableStaff(businessId: UUID, staffId: UUID, serviceId: UUID) {
    const staff = find(tables.staff, businessId, staffId);
    if (!staff) throw notFound('Staff');
    if (!staff.is_active || !staff.accepts_bookings) throw rule('STAFF_INACTIVE', 'Staff member is not taking bookings');
    if (!tables.staff_services.some((l) => l.staff_id === staffId && l.service_id === serviceId)) {
      throw rule('STAFF_NOT_QUALIFIED', 'Staff member cannot perform this service');
    }
  }

  function ranges(businessId: UUID, startsAt: string, durationMinutes: number) {
    const start = Date.parse(startsAt);
    const end = start + durationMinutes * 60_000;
    return { slot: toPgRange(start, end), blocked: toPgRange(start, end + bufferFor(businessId) * 60_000) };
  }

  function event(appointment_id: UUID, type: string, actor: string, actor_id: string | null, payload: unknown = {}) {
    tables.appointment_events.push({ appointment_id, type, actor, actor_id, payload });
  }

  function appointmentById(id: UUID): AppointmentRow {
    const row = tables.appointments.find((a) => a.id === id);
    if (!row) throw notFound('Appointment');
    return row;
  }

  return {
    tables,
    nextId,

    // ----- catalog -----
    async getBusiness(id) {
      return clone(tables.businesses.find((b) => b.id === id) ?? null);
    },
    async getBusinessBySlug(slug) {
      return clone(tables.businesses.find((b) => b.slug.toLowerCase() === slug.toLowerCase()) ?? null);
    },
    async updateBusiness(id, patch) {
      const row = tables.businesses.find((b) => b.id === id);
      if (!row) throw notFound('Business');
      if (patch.slug) assertUniqueSlug(patch.slug, id);
      return patchRow(row, patch)!;
    },
    async listBusinessHours(businessId) {
      return clone(
        inBusiness(tables.business_hours, businessId).sort((a, b) => a.weekday - b.weekday || a.opens_at.localeCompare(b.opens_at)),
      );
    },
    async replaceBusinessHours(businessId, hours) {
      tables.business_hours = tables.business_hours.filter((h) => h.business_id !== businessId);
      tables.business_hours.push(...hours.map((h) => ({ business_id: businessId, ...h })));
    },

    async completeOnboarding(input) {
      const { businessId } = input;
      if (!tables.businesses.some((b) => b.id === businessId)) throw notFound('Business');
      if (onboarded.has(businessId)) return false;
      // Validate everything before touching a table: the real RPC is one transaction, so a bad row applies nothing.
      const badName = [...input.team, ...input.services].some((x) => x.name.trim().length === 0);
      const badService = input.services.some((s) => s.duration_minutes <= 0 || s.duration_minutes > 720 || s.price_cents < 0);
      const badHours = input.hours.some((h) => h.weekday < 0 || h.weekday > 6 || h.closes_at <= h.opens_at);
      if (badName || badService || badHours) throw new AppError('VALIDATION_FAILED', 'Invalid onboarding data');

      const staffValues = (name: string, title: string | null, sort_order: number, user_id: string | null): StaffValues => ({
        user_id, name, title, photo_url: null, phone: null, email: null, color: null, is_active: true, accepts_bookings: true, sort_order,
      });
      let owner = tables.staff.find((s) => s.business_id === businessId && s.user_id === input.userId);
      if (!owner) {
        owner = { id: nextId(), business_id: businessId, ...staffValues(input.ownerName.trim() || 'Owner', null, 0, input.userId) };
        tables.staff.push(owner);
      }
      tables.business_hours = tables.business_hours.filter((h) => h.business_id !== businessId);
      tables.business_hours.push(...input.hours.map((h) => ({ business_id: businessId, ...h })));
      const staffIds = [owner.id];
      for (const [i, m] of input.team.entries()) {
        const row: StaffRow = { id: nextId(), business_id: businessId, ...staffValues(m.name, m.title, i + 1, null) };
        tables.staff.push(row);
        staffIds.push(row.id);
      }
      for (const [i, s] of input.services.entries()) {
        const row: ServiceRow = {
          id: nextId(), business_id: businessId, name: s.name, description: null, category: null,
          duration_minutes: s.duration_minutes, price_cents: s.price_cents, deposit_cents: 0, is_active: true, sort_order: i,
        };
        tables.services.push(row);
        for (const staff_id of staffIds) tables.staff_services.push({ business_id: businessId, staff_id, service_id: row.id });
      }
      onboarded.add(businessId);
      return true;
    },

    async listServices(businessId, o = {}) {
      return clone(
        inBusiness(tables.services, businessId)
          .filter((s) => !o.activeOnly || s.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      );
    },
    async getService(businessId, id) {
      return clone(find(tables.services, businessId, id));
    },
    async insertService(businessId, values) {
      const row: ServiceRow = { id: nextId(), business_id: businessId, ...values };
      tables.services.push(row);
      return clone(row);
    },
    async updateService(businessId, id, patch) {
      return patchRow(find(tables.services, businessId, id), patch);
    },
    async deleteService(businessId, id) {
      tables.staff_services = tables.staff_services.filter((l) => !(l.business_id === businessId && l.service_id === id));
      tables.services = tables.services.filter((s) => !(s.business_id === businessId && s.id === id));
    },
    async setServiceStaff(businessId, serviceId, staffIds) {
      tables.staff_services = tables.staff_services.filter(
        (l) => !(l.business_id === businessId && l.service_id === serviceId),
      );
      tables.staff_services.push(...staffIds.map((staff_id) => ({ business_id: businessId, staff_id, service_id: serviceId })));
    },

    async listStaff(businessId) {
      return clone(
        inBusiness(tables.staff, businessId).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
      );
    },
    async getStaff(businessId, id) {
      return clone(find(tables.staff, businessId, id));
    },
    async findStaffByUserId(businessId, userId) {
      return clone(tables.staff.find((s) => s.business_id === businessId && s.user_id === userId) ?? null);
    },
    async insertStaff(businessId, values) {
      const row: StaffRow = { id: nextId(), business_id: businessId, ...values };
      tables.staff.push(row);
      return clone(row);
    },
    async updateStaff(businessId, id, patch) {
      return patchRow(find(tables.staff, businessId, id), patch);
    },
    async deleteStaff(businessId, id) {
      const keep = <T extends { business_id: UUID; staff_id: UUID | null }>(l: T[]) =>
        l.filter((r) => !(r.business_id === businessId && r.staff_id === id));
      tables.staff_services = keep(tables.staff_services);
      tables.availability_rules = keep(tables.availability_rules);
      tables.availability_overrides = keep(tables.availability_overrides);
      tables.staff = tables.staff.filter((s) => !(s.business_id === businessId && s.id === id));
    },
    async listStaffServices(businessId) {
      return clone(inBusiness(tables.staff_services, businessId));
    },
    async replaceStaffServices(businessId, staffId, serviceIds) {
      if (!find(tables.staff, businessId, staffId)) throw notFound('Staff');
      tables.staff_services = tables.staff_services.filter((l) => l.staff_id !== staffId);
      tables.staff_services.push(...serviceIds.map((service_id) => ({ business_id: businessId, staff_id: staffId, service_id })));
    },
    async listAvailabilityRules(businessId, staffIds) {
      return clone(inBusiness(tables.availability_rules, businessId).filter((r) => staffIds.includes(r.staff_id)));
    },
    async replaceStaffAvailability(businessId, staffId, rules) {
      if (!find(tables.staff, businessId, staffId)) throw notFound('Staff');
      tables.availability_rules = tables.availability_rules.filter((r) => r.staff_id !== staffId);
      tables.availability_rules.push(...rules.map((r) => ({ business_id: businessId, staff_id: staffId, ...r })));
    },

    async listOverrides(businessId, from, to) {
      return clone(inBusiness(tables.availability_overrides, businessId).filter((o) => o.date >= from && o.date <= to));
    },
    async insertOverride(businessId, values) {
      const row: OverrideRow = { id: nextId(), business_id: businessId, ...values };
      tables.availability_overrides.push(row);
      return clone(row);
    },
    async deleteOverride(businessId, id) {
      const before = tables.availability_overrides.length;
      tables.availability_overrides = tables.availability_overrides.filter((o) => !(o.business_id === businessId && o.id === id));
      return tables.availability_overrides.length < before;
    },

    async countAppointments(businessId, filter) {
      return inBusiness(tables.appointments, businessId).filter(
        (a) => (!filter.serviceId || a.service_id === filter.serviceId) && (!filter.staffId || a.staff_id === filter.staffId),
      ).length;
    },

    // ----- appointments -----
    async listBusy(businessId, staffIds, fromIso, toIso) {
      const window = toPgRange(Date.parse(fromIso), Date.parse(toIso));
      return inBusiness(tables.appointments, businessId)
        .filter((a) => staffIds.includes(a.staff_id) && a.status !== 'cancelled' && overlaps(a.blocked, window))
        .map((a): BusyRow => ({ id: a.id, staff_id: a.staff_id, blocked: a.blocked }));
    },
    async getAppointment(businessId, id) {
      return clone(find(tables.appointments, businessId, id));
    },
    async findAppointmentByIdempotencyKey(businessId, key) {
      return clone(tables.appointments.find((a) => a.business_id === businessId && a.idempotency_key === key) ?? null);
    },
    async listAppointmentsInWindow(businessId, f) {
      const from = Date.parse(f.fromIso);
      const to = Date.parse(f.toIso);
      const start = (a: AppointmentRow) => Date.parse(rangeBounds(a.slot).start);
      return clone(
        inBusiness(tables.appointments, businessId)
          .filter((a) => start(a) >= from && start(a) < to)
          .filter((a) => !f.staffId || a.staff_id === f.staffId)
          .filter((a) => !f.clientId || a.client_id === f.clientId)
          .filter((a) => !f.status || a.status === f.status)
          .sort((a, b) => start(a) - start(b) || a.id.localeCompare(b.id))
          .filter((a) => {
            if (!f.after) return true;
            const afterMs = Date.parse(f.after.startsAt);
            return start(a) > afterMs || (start(a) === afterMs && a.id > f.after.id);
          })
          .slice(0, f.limit),
      );
    },
    async listUpcomingAppointments(businessId, clientId, nowIso) {
      const at = Date.parse(nowIso);
      return clone(
        inBusiness(tables.appointments, businessId)
          .filter((a) => a.client_id === clientId && a.status === 'confirmed' && Date.parse(rangeBounds(a.slot).start) > at)
          .sort((a, b) => Date.parse(rangeBounds(a.slot).start) - Date.parse(rangeBounds(b.slot).start)),
      );
    },
    async createAppointment(a) {
      const existing = tables.appointments.find((x) => x.business_id === a.businessId && x.idempotency_key === a.idempotencyKey);
      if (existing) return clone(existing);
      const service = find(tables.services, a.businessId, a.serviceId);
      if (!service) throw notFound('Service');
      if (!service.is_active) throw rule('SERVICE_INACTIVE', 'Service is not active');
      assertBookableStaff(a.businessId, a.staffId, a.serviceId);
      const client = find(tables.clients, a.businessId, a.clientId);
      if (!client) throw notFound('Client');
      if (client.is_blocked) throw rule('CLIENT_BLOCKED', 'Client is blocked');
      const { slot, blocked } = ranges(a.businessId, a.startsAt, service.duration_minutes);
      assertNoOverlap(a.staffId, blocked);
      const row: AppointmentRow = {
        id: nextId(),
        business_id: a.businessId,
        client_id: a.clientId,
        staff_id: a.staffId,
        service_id: a.serviceId,
        slot,
        blocked,
        status: 'confirmed',
        source: a.source,
        price_cents: service.price_cents,
        duration_minutes: service.duration_minutes,
        notes: a.notes,
        idempotency_key: a.idempotencyKey,
        checked_in_at: null,
        cancelled_at: null,
        cancel_reason: null,
        created_by: a.actorId,
        created_at: now(),
      };
      tables.appointments.push(row);
      event(row.id, 'created', a.actor, a.actorId);
      return clone(row);
    },
    async rescheduleAppointment(a) {
      const row = appointmentById(a.appointmentId);
      if (row.status !== 'confirmed') throw rule('INVALID_STATUS', 'Only confirmed appointments can be rescheduled');
      const staffId = a.staffId ?? row.staff_id;
      assertBookableStaff(row.business_id, staffId, row.service_id);
      const { slot, blocked } = ranges(row.business_id, a.startsAt, row.duration_minutes);
      assertNoOverlap(staffId, blocked, row.id);
      const from = rangeBounds(row.slot).start;
      event(row.id, 'rescheduled', a.actor, a.actorId, {
        from,
        to: new Date(a.startsAt).toISOString(),
        from_staff_id: row.staff_id,
        to_staff_id: staffId,
      });
      Object.assign(row, { slot, blocked, staff_id: staffId });
      return clone(row);
    },
    async cancelAppointment(a) {
      const row = appointmentById(a.appointmentId);
      if (row.status !== 'confirmed') throw rule('INVALID_STATUS', 'Only confirmed appointments can be cancelled');
      Object.assign(row, { status: 'cancelled', cancelled_at: now(), cancel_reason: a.reason });
      event(row.id, 'cancelled', a.actor, a.actorId, { reason: a.reason });
      return clone(row);
    },
    async setAppointmentStatus(a) {
      const row = appointmentById(a.appointmentId);
      if (row.status !== 'confirmed') throw rule('INVALID_STATUS', 'Only confirmed appointments can change status');
      row.status = a.status;
      event(row.id, a.status, a.actor, a.actorId);
      return clone(row);
    },
    async checkInAppointment(appointmentId, actorId) {
      const row = appointmentById(appointmentId);
      if (row.status !== 'confirmed') throw rule('INVALID_STATUS', 'Only confirmed appointments can be checked in');
      row.checked_in_at = now();
      event(row.id, 'checked_in', 'staff', actorId);
      return clone(row);
    },
    async updateAppointmentNotes(businessId, id, notes) {
      return patchRow(find(tables.appointments, businessId, id), { notes });
    },

    // ----- clients -----
    async getClient(businessId, id) {
      return clone(find(tables.clients, businessId, id));
    },
    async findClientByPhone(businessId, phone) {
      return clone(tables.clients.find((c) => c.business_id === businessId && c.phone_e164 === phone) ?? null);
    },
    async listClientsByIds(businessId, ids) {
      return clone(inBusiness(tables.clients, businessId).filter((c) => ids.includes(c.id)));
    },
    async upsertClientByPhone(businessId, phone, name) {
      const existing = tables.clients.find((c) => c.business_id === businessId && c.phone_e164 === phone);
      if (existing) {
        existing.last_seen_at = now();
        if (existing.name === null && name) existing.name = name;
        return clone(existing);
      }
      const row: ClientRow = {
        id: nextId(),
        business_id: businessId,
        phone_e164: phone,
        name,
        email: null,
        notes: null,
        tags: [],
        is_blocked: false,
        whatsapp_opt_in: true,
        first_seen_at: now(),
        last_seen_at: now(),
      };
      tables.clients.push(row);
      return clone(row);
    },
    async updateClient(businessId, id, patch) {
      if (patch.phone_e164 && tables.clients.some((c) => c.business_id === businessId && c.phone_e164 === patch.phone_e164 && c.id !== id)) {
        throw pgError('23505', 'duplicate key value violates unique constraint "clients_business_id_phone_e164_key"');
      }
      return patchRow(find(tables.clients, businessId, id), patch);
    },
    async insertClientNote(businessId, values) {
      if (!find(tables.clients, businessId, values.client_id)) throw pgError('23503', 'foreign key violation');
      const row: ClientNoteRow = { id: nextId(), business_id: businessId, created_at: now(), ...values };
      tables.client_notes.push(row);
      return clone(row);
    },
    async deleteClientNote(businessId, clientId, noteId) {
      const before = tables.client_notes.length;
      tables.client_notes = tables.client_notes.filter(
        (n) => !(n.business_id === businessId && n.client_id === clientId && n.id === noteId),
      );
      return tables.client_notes.length < before;
    },

    // ----- members -----
    async getUser(userId) {
      return clone(tables.users.find((u) => u.id === userId) ?? null);
    },
    async upsertDeviceToken(businessId, userId, token, platform) {
      tables.device_push_tokens = tables.device_push_tokens.filter((d) => d.token !== token);
      tables.device_push_tokens.push({ business_id: businessId, user_id: userId, token, platform });
    },

    // ----- attempts -----
    async insertAttempt(values) {
      const row: BookingAttemptRow = {
        id: nextId(),
        client_id: null,
        conversation_id: null,
        started_at: now(),
        completed_at: null,
        step_count: 0,
        outcome: 'in_progress',
        appointment_id: null,
        error_code: null,
        steps: [],
        ...values,
      };
      tables.booking_attempts.push(row);
      return clone(row);
    },
    async getAttempt(id) {
      return clone(tables.booking_attempts.find((a) => a.id === id) ?? null);
    },
    async updateAttempt(businessId, id, patch) {
      const row = patchRow(find(tables.booking_attempts, businessId, id), patch);
      if (!row) throw notFound('Attempt');
      return row;
    },

    // ----- identity -----
    async getBusinessByOrgId(orgId) {
      return clone(tables.businesses.find((b) => b.clerk_org_id === orgId) ?? null);
    },
    async insertBusiness(values) {
      if (tables.businesses.some((b) => b.clerk_org_id === values.clerk_org_id)) throw pgError('23505', 'duplicate org');
      assertUniqueSlug(values.slug);
      const row: BusinessRow = {
        id: nextId(),
        timezone: 'Africa/Johannesburg',
        currency: 'ZAR',
        logo_url: null,
        address: null,
        phone: null,
        email: null,
        booking_rules: { ...DEFAULT_BOOKING_RULES },
        ...values,
      };
      tables.businesses.push(row);
      return clone(row);
    },
    async updateBusinessByOrgId(orgId, patch) {
      const row = tables.businesses.find((b) => b.clerk_org_id === orgId);
      if (patch.slug && row) assertUniqueSlug(patch.slug, row.id);
      patchRow(row ?? null, patch);
    },
    async deleteBusinessByOrgId(orgId) {
      const row = tables.businesses.find((b) => b.clerk_org_id === orgId);
      if (!row) return;
      tables.businesses = tables.businesses.filter((b) => b.id !== row.id);
      tables.staff = tables.staff.filter((s) => s.business_id !== row.id);
      tables.services = tables.services.filter((s) => s.business_id !== row.id);
    },
    async isSlugTaken(slug, exceptId) {
      return tables.businesses.some((b) => b.slug.toLowerCase() === slug.toLowerCase() && b.id !== exceptId);
    },
    async upsertUser(values) {
      const row = tables.users.find((u) => u.id === values.id);
      const defined = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
      if (row) Object.assign(row, defined);
      else
        tables.users.push({
          business_id: null,
          role: 'staff',
          email: null,
          display_name: null,
          avatar_url: null,
          ...(defined as { id: string }),
        });
    },
    async deleteUser(userId) {
      tables.users = tables.users.filter((u) => u.id !== userId);
    },
    async unlinkStaffUser(userId, businessId) {
      for (const s of tables.staff) {
        if (s.user_id === userId && (!businessId || s.business_id === businessId)) s.user_id = null;
      }
    },
    async detachBusinessUsers(businessId) {
      for (const u of tables.users) if (u.business_id === businessId) u.business_id = null;
    },
    async recordWebhookEvent(source, eventKey, payload) {
      const existing = tables.webhook_events.find((e) => e.source === source && e.event_key === eventKey);
      if (existing) return { row: clone(existing), duplicate: true };
      const row: WebhookEventRow = {
        id: nextId(),
        source,
        event_key: eventKey,
        payload,
        received_at: now(),
        processed_at: null,
        error: null,
        attempts: 0,
      };
      tables.webhook_events.push(row);
      return { row: clone(row), duplicate: false };
    },
    async finishWebhookEvent(id, result) {
      const row = tables.webhook_events.find((e) => e.id === id);
      if (row) Object.assign(row, { processed_at: result.processedAt, error: result.error, attempts: result.attempts });
    },

    // ----- maintenance -----
    async deleteExpiredIdempotencyKeys(nowIso) {
      const before = tables.idempotency_keys.length;
      tables.idempotency_keys = tables.idempotency_keys.filter((k) => k.expires_at >= nowIso);
      return before - tables.idempotency_keys.length;
    },
    async pruneProcessedWebhookEvents(beforeIso) {
      const before = tables.webhook_events.length;
      tables.webhook_events = tables.webhook_events.filter((e) => !(e.processed_at !== null && e.processed_at < beforeIso));
      return before - tables.webhook_events.length;
    },
    async abandonStaleAttempts(channel, startedBeforeIso) {
      let n = 0;
      for (const a of tables.booking_attempts) {
        if (a.channel === channel && a.outcome === 'in_progress' && a.started_at < startedBeforeIso) {
          a.outcome = 'abandoned';
          n += 1;
        }
      }
      return n;
    },
  };
}

