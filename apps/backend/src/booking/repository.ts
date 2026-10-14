/**
 * All database access for the booking core, behind one interface so the
 * service and routes can be tested against `createMemoryRepository()`.
 *
 * The Supabase implementation uses the service-role client, which bypasses
 * RLS: every table query is scoped by `business_id`. The documented
 * exceptions are identity lookups that happen before a business is known
 * (Clerk mirror, public attempt ids) and the global maintenance job.
 * RPCs that take no business id (reschedule/cancel/status/check-in,
 * replace_staff_*) are only called after the caller verified ownership.
 */
import type {
  AppointmentSource,
  AppointmentStatus,
  BusinessHoursRow,
  AvailabilityRuleInput,
  UUID,
} from '../../../../packages/shared/api.ts';
import type { Database, Json, TablesUpdate } from '../../../../packages/shared/database.types.ts';
import type { Db } from '../lib/db.ts';

type TableName = keyof Database['public']['Tables'];
import { AppError, mapDbError, type PostgrestLikeError } from '../lib/errors.ts';
import { serializeTsRange } from '../lib/time.ts';
import type {
  ActorRef,
  AppointmentRow,
  AvailabilityRuleRow,
  BookingAttemptRow,
  BookingChannel,
  BusinessHoursDbRow,
  BusinessRow,
  ClientNoteKind,
  ClientNoteRow,
  ClientRow,
  OverrideRow,
  ServiceRow,
  StaffRow,
  StaffServiceRow,
  UserRow,
  WebhookEventRow,
} from './rows.ts';

// ---------- value types ----------

export type BusinessPatch = Partial<Omit<BusinessRow, 'id' | 'clerk_org_id'>>;
export type ServiceValues = Omit<ServiceRow, 'id' | 'business_id'>;
export type StaffValues = Omit<StaffRow, 'id' | 'business_id'>;
export type ClientPatch = Partial<
  Pick<ClientRow, 'phone_e164' | 'name' | 'email' | 'notes' | 'tags' | 'is_blocked' | 'whatsapp_opt_in'>
>;
export type OverrideValues = Omit<OverrideRow, 'id' | 'business_id'>;
export type AttemptPatch = Partial<
  Pick<BookingAttemptRow, 'client_id' | 'completed_at' | 'step_count' | 'outcome' | 'appointment_id' | 'error_code' | 'steps'>
>;

export interface AppointmentWindowFilter {
  fromIso: string;
  toIso: string;
  staffId?: UUID;
  clientId?: UUID;
  status?: AppointmentStatus;
  /** Keyset cursor: rows strictly after (starts_at, id) */
  after?: { startsAt: string; id: UUID };
  limit: number;
}

export interface BusyRow {
  id: UUID;
  staff_id: UUID;
  /** tstzrange text */
  blocked: string;
}

export interface CreateAppointmentArgs extends ActorRef {
  businessId: UUID;
  clientId: UUID;
  staffId: UUID;
  serviceId: UUID;
  startsAt: string;
  source: AppointmentSource;
  idempotencyKey: string;
  notes: string | null;
}

export interface RescheduleArgs extends ActorRef {
  appointmentId: UUID;
  startsAt: string;
  staffId: UUID | null;
}

export interface CancelArgs extends ActorRef {
  appointmentId: UUID;
  reason: string | null;
}

export interface SetStatusArgs extends ActorRef {
  appointmentId: UUID;
  status: Extract<AppointmentStatus, 'completed' | 'no_show'>;
}

export interface NewBusiness {
  clerk_org_id: string;
  name: string;
  slug: string;
}

export interface UserValues {
  id: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  business_id?: UUID | null;
  role?: UserRow['role'];
}

// ---------- interface ----------

export interface CompleteOnboardingInput {
  businessId: UUID;
  userId: string;
  ownerName: string;
  hours: BusinessHoursRow[];
  team: { name: string; title: string | null }[];
  services: { name: string; duration_minutes: number; price_cents: number }[];
}

export interface CatalogRepository {
  getBusiness(businessId: UUID): Promise<BusinessRow | null>;
  getBusinessBySlug(slug: string): Promise<BusinessRow | null>;
  updateBusiness(businessId: UUID, patch: BusinessPatch): Promise<BusinessRow>;
  listBusinessHours(businessId: UUID): Promise<BusinessHoursDbRow[]>;
  replaceBusinessHours(businessId: UUID, rows: BusinessHoursRow[]): Promise<void>;
  /**
   * RPC complete_onboarding: hours, owner + team staff and services in ONE transaction under a business lock, the
   * completion marker written last. Resolves true when applied, false when the business was already onboarded.
   */
  completeOnboarding(input: CompleteOnboardingInput): Promise<boolean>;

  listServices(businessId: UUID, opts?: { activeOnly?: boolean }): Promise<ServiceRow[]>;
  getService(businessId: UUID, serviceId: UUID): Promise<ServiceRow | null>;
  insertService(businessId: UUID, values: ServiceValues): Promise<ServiceRow>;
  updateService(businessId: UUID, serviceId: UUID, patch: Partial<ServiceValues>): Promise<ServiceRow | null>;
  deleteService(businessId: UUID, serviceId: UUID): Promise<void>;
  /** Makes `staffIds` exactly the staff qualified for the service */
  setServiceStaff(businessId: UUID, serviceId: UUID, staffIds: UUID[]): Promise<void>;

  listStaff(businessId: UUID): Promise<StaffRow[]>;
  getStaff(businessId: UUID, staffId: UUID): Promise<StaffRow | null>;
  findStaffByUserId(businessId: UUID, userId: string): Promise<StaffRow | null>;
  insertStaff(businessId: UUID, values: StaffValues): Promise<StaffRow>;
  updateStaff(businessId: UUID, staffId: UUID, patch: Partial<StaffValues>): Promise<StaffRow | null>;
  deleteStaff(businessId: UUID, staffId: UUID): Promise<void>;
  listStaffServices(businessId: UUID): Promise<StaffServiceRow[]>;
  /** RPC replace_staff_services (caller verified ownership) */
  replaceStaffServices(businessId: UUID, staffId: UUID, serviceIds: UUID[]): Promise<void>;
  listAvailabilityRules(businessId: UUID, staffIds: UUID[]): Promise<AvailabilityRuleRow[]>;
  /** RPC replace_staff_availability (caller verified ownership) */
  replaceStaffAvailability(businessId: UUID, staffId: UUID, rules: AvailabilityRuleInput[]): Promise<void>;

  listOverrides(businessId: UUID, from: string, to: string): Promise<OverrideRow[]>;
  insertOverride(businessId: UUID, values: OverrideValues): Promise<OverrideRow>;
  deleteOverride(businessId: UUID, overrideId: UUID): Promise<boolean>;

  countAppointments(businessId: UUID, filter: { serviceId?: UUID; staffId?: UUID }): Promise<number>;
}

export interface AppointmentRepository {
  /** Non-cancelled appointments of `staffIds` whose blocked range overlaps [from, to) */
  listBusy(businessId: UUID, staffIds: UUID[], fromIso: string, toIso: string): Promise<BusyRow[]>;
  getAppointment(businessId: UUID, appointmentId: UUID): Promise<AppointmentRow | null>;
  findAppointmentByIdempotencyKey(businessId: UUID, key: string): Promise<AppointmentRow | null>;
  /** Appointments starting in [fromIso, toIso), ordered by (starts_at, id), at most `limit` rows */
  listAppointmentsInWindow(businessId: UUID, filter: AppointmentWindowFilter): Promise<AppointmentRow[]>;
  /** Confirmed, starting strictly after `nowIso`, ascending */
  listUpcomingAppointments(businessId: UUID, clientId: UUID, nowIso: string): Promise<AppointmentRow[]>;
  createAppointment(args: CreateAppointmentArgs): Promise<AppointmentRow>;
  rescheduleAppointment(args: RescheduleArgs): Promise<AppointmentRow>;
  cancelAppointment(args: CancelArgs): Promise<AppointmentRow>;
  setAppointmentStatus(args: SetStatusArgs): Promise<AppointmentRow>;
  checkInAppointment(appointmentId: UUID, actorId: string | null): Promise<AppointmentRow>;
  updateAppointmentNotes(businessId: UUID, appointmentId: UUID, notes: string | null): Promise<AppointmentRow | null>;
}

export interface ClientRepository {
  getClient(businessId: UUID, clientId: UUID): Promise<ClientRow | null>;
  findClientByPhone(businessId: UUID, phoneE164: string): Promise<ClientRow | null>;
  /** Clients by id, in no particular order; unknown ids are skipped */
  listClientsByIds(businessId: UUID, clientIds: UUID[]): Promise<ClientRow[]>;
  /** RPC upsert_client_by_phone: inserts or bumps last_seen_at; only fills name when null */
  upsertClientByPhone(businessId: UUID, phoneE164: string, name: string | null): Promise<ClientRow>;
  updateClient(businessId: UUID, clientId: UUID, patch: ClientPatch): Promise<ClientRow | null>;
  insertClientNote(
    businessId: UUID,
    values: { client_id: UUID; body: string; kind: ClientNoteKind; created_by: string | null },
  ): Promise<ClientNoteRow>;
  deleteClientNote(businessId: UUID, clientId: UUID, noteId: UUID): Promise<boolean>;
}

export interface AuditEntry {
  businessId: UUID;
  actorId: string;
  action: 'insert' | 'update' | 'delete';
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  requestId?: string;
}

export interface MemberRepository {
  getUser(userId: string): Promise<UserRow | null>;
  upsertDeviceToken(businessId: UUID, userId: string, token: string, platform: string): Promise<void>;
  /** RPC record_audit_event: audit_log entry for changes the row triggers cannot see (Clerk membership) */
  recordAudit(entry: AuditEntry): Promise<void>;
}

export interface AttemptRepository {
  insertAttempt(values: { business_id: UUID; channel: BookingChannel; session_key: string | null }): Promise<BookingAttemptRow>;
  /** Looked up by id alone: the public attempt id is the capability */
  getAttempt(attemptId: UUID): Promise<BookingAttemptRow | null>;
  updateAttempt(businessId: UUID, attemptId: UUID, patch: AttemptPatch): Promise<BookingAttemptRow>;
}

export interface IdentityRepository {
  getBusinessByOrgId(orgId: string): Promise<BusinessRow | null>;
  insertBusiness(values: NewBusiness): Promise<BusinessRow>;
  updateBusinessByOrgId(orgId: string, patch: { name?: string; slug?: string }): Promise<void>;
  deleteBusinessByOrgId(orgId: string): Promise<void>;
  isSlugTaken(slug: string, exceptBusinessId?: UUID): Promise<boolean>;
  upsertUser(values: UserValues): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  /** Clears staff.user_id wherever it points at the user (optionally in one business) */
  unlinkStaffUser(userId: string, businessId?: UUID): Promise<void>;
  /** Clears users.business_id for every member of the business */
  detachBusinessUsers(businessId: UUID): Promise<void>;
  /** Inserts the event; returns the existing row instead when the key is a duplicate */
  recordWebhookEvent(source: string, eventKey: string, payload: unknown): Promise<{ row: WebhookEventRow; duplicate: boolean }>;
  finishWebhookEvent(id: UUID, result: { processedAt: string | null; error: string | null; attempts: number }): Promise<void>;
}

export interface MaintenanceRepository {
  deleteExpiredIdempotencyKeys(nowIso: string): Promise<number>;
  pruneProcessedWebhookEvents(beforeIso: string): Promise<number>;
  abandonStaleAttempts(channel: BookingChannel, startedBeforeIso: string): Promise<number>;
}

export interface BookingRepository
  extends CatalogRepository,
    AppointmentRepository,
    ClientRepository,
    MemberRepository,
    AttemptRepository,
    IdentityRepository,
    MaintenanceRepository {}

// ---------- Supabase implementation ----------

const BUSINESS_COLS = 'id, clerk_org_id, name, slug, timezone, currency, logo_url, address, phone, email, booking_rules';
const SERVICE_COLS =
  'id, business_id, name, description, category, duration_minutes, price_cents, deposit_cents, is_active, sort_order';
const STAFF_COLS =
  'id, business_id, user_id, name, title, photo_url, phone, email, color, is_active, accepts_bookings, sort_order';
const CLIENT_COLS =
  'id, business_id, phone_e164, name, email, notes, tags, is_blocked, whatsapp_opt_in, first_seen_at, last_seen_at';
const APPOINTMENT_COLS =
  'id, business_id, client_id, staff_id, service_id, slot, blocked, status, source, price_cents, duration_minutes, notes, idempotency_key, checked_in_at, cancelled_at, cancel_reason, created_by, created_at';
const ATTEMPT_COLS =
  'id, business_id, channel, client_id, conversation_id, session_key, started_at, completed_at, step_count, outcome, appointment_id, error_code, steps';

interface Result<T> {
  data: T | null;
  error: PostgrestLikeError | null;
  count?: number | null;
}

function rows<T>(result: Result<unknown>): T[] {
  if (result.error) throw mapDbError(result.error);
  return (result.data ?? []) as T[];
}

function maybe<T>(result: Result<unknown>): T | null {
  if (result.error) throw mapDbError(result.error);
  return (result.data ?? null) as T | null;
}

function one<T>(result: Result<unknown>, entity: string): T {
  const row = maybe<T>(result);
  if (!row) throw new AppError('NOT_FOUND', `${entity} not found`);
  return row;
}

function count(result: Result<unknown>): number {
  if (result.error) throw mapDbError(result.error);
  return result.count ?? 0;
}

/** RPCs returning a composite come back as an object (or a one-element array). */
function rpcRow<T>(result: Result<unknown>, entity: string): T {
  if (result.error) throw mapDbError(result.error);
  const data = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!data) throw new AppError('NOT_FOUND', `${entity} not found`);
  return data as T;
}

function check(result: Result<unknown>): void {
  if (result.error) throw mapDbError(result.error);
}

export function createSupabaseRepository(db: Db): BookingRepository {
  const t = <T extends TableName>(table: T) => db.from(table);

  return {
    // ----- catalog -----
    async getBusiness(businessId) {
      return maybe(await t('businesses').select(BUSINESS_COLS).eq('id', businessId).maybeSingle());
    },
    async getBusinessBySlug(slug) {
      return maybe(await t('businesses').select(BUSINESS_COLS).eq('slug', slug).maybeSingle());
    },
    async updateBusiness(businessId, patch) {
      return one(await t('businesses').update(patch).eq('id', businessId).select(BUSINESS_COLS).maybeSingle(), 'Business');
    },
    async listBusinessHours(businessId) {
      return rows(
        await t('business_hours')
          .select('business_id, weekday, opens_at, closes_at')
          .eq('business_id', businessId)
          .order('weekday')
          .order('opens_at'),
      );
    },
    async replaceBusinessHours(businessId, hours) {
      check(await db.rpc('replace_business_hours', { p_business_id: businessId, p_rows: hours as unknown as Json }));
    },
    async completeOnboarding(input) {
      const result = await db.rpc('complete_onboarding', {
        p_business_id: input.businessId,
        p_user_id: input.userId,
        p_owner_name: input.ownerName,
        p_hours: input.hours as unknown as Json,
        p_team: input.team as unknown as Json,
        p_services: input.services as unknown as Json,
      });
      if (result.error) throw mapDbError(result.error);
      return result.data === true;
    },

    async listServices(businessId, opts = {}) {
      let q = t('services').select(SERVICE_COLS).eq('business_id', businessId);
      if (opts.activeOnly) q = q.eq('is_active', true);
      return rows(await q.order('sort_order').order('name').order('id'));
    },
    async getService(businessId, serviceId) {
      return maybe(await t('services').select(SERVICE_COLS).eq('business_id', businessId).eq('id', serviceId).maybeSingle());
    },
    async insertService(businessId, values) {
      return one(await t('services').insert({ ...values, business_id: businessId }).select(SERVICE_COLS).single(), 'Service');
    },
    async updateService(businessId, serviceId, patch) {
      return maybe(
        await t('services').update(patch).eq('business_id', businessId).eq('id', serviceId).select(SERVICE_COLS).maybeSingle(),
      );
    },
    async deleteService(businessId, serviceId) {
      check(await t('staff_services').delete().eq('business_id', businessId).eq('service_id', serviceId));
      check(await t('services').delete().eq('business_id', businessId).eq('id', serviceId));
    },
    async setServiceStaff(businessId, serviceId, staffIds) {
      let del = t('staff_services').delete().eq('business_id', businessId).eq('service_id', serviceId);
      if (staffIds.length) del = del.not('staff_id', 'in', `(${staffIds.join(',')})`);
      check(await del);
      if (staffIds.length) {
        const links = staffIds.map((staff_id) => ({ business_id: businessId, staff_id, service_id: serviceId }));
        check(await t('staff_services').upsert(links, { onConflict: 'staff_id,service_id', ignoreDuplicates: true }));
      }
    },

    async listStaff(businessId) {
      return rows(await t('staff').select(STAFF_COLS).eq('business_id', businessId).order('sort_order').order('id'));
    },
    async getStaff(businessId, staffId) {
      return maybe(await t('staff').select(STAFF_COLS).eq('business_id', businessId).eq('id', staffId).maybeSingle());
    },
    async findStaffByUserId(businessId, userId) {
      return maybe(
        await t('staff').select(STAFF_COLS).eq('business_id', businessId).eq('user_id', userId).limit(1).maybeSingle(),
      );
    },
    async insertStaff(businessId, values) {
      return one(await t('staff').insert({ ...values, business_id: businessId }).select(STAFF_COLS).single(), 'Staff');
    },
    async updateStaff(businessId, staffId, patch) {
      return maybe(
        await t('staff').update(patch).eq('business_id', businessId).eq('id', staffId).select(STAFF_COLS).maybeSingle(),
      );
    },
    async deleteStaff(businessId, staffId) {
      check(await t('staff_services').delete().eq('business_id', businessId).eq('staff_id', staffId));
      check(await t('availability_rules').delete().eq('business_id', businessId).eq('staff_id', staffId));
      check(await t('availability_overrides').delete().eq('business_id', businessId).eq('staff_id', staffId));
      check(await t('staff').delete().eq('business_id', businessId).eq('id', staffId));
    },
    async listStaffServices(businessId) {
      return rows(await t('staff_services').select('business_id, staff_id, service_id').eq('business_id', businessId));
    },
    async replaceStaffServices(_businessId, staffId, serviceIds) {
      check(await db.rpc('replace_staff_services', { p_staff_id: staffId, p_service_ids: serviceIds }));
    },
    async listAvailabilityRules(businessId, staffIds) {
      if (staffIds.length === 0) return [];
      return rows(
        await t('availability_rules')
          .select('business_id, staff_id, weekday, start_time, end_time')
          .eq('business_id', businessId)
          .in('staff_id', staffIds),
      );
    },
    async replaceStaffAvailability(_businessId, staffId, rules) {
      check(await db.rpc('replace_staff_availability', { p_staff_id: staffId, p_rows: rules as unknown as Json }));
    },

    async listOverrides(businessId, from, to) {
      return rows(
        await t('availability_overrides')
          .select('id, business_id, staff_id, date, start_time, end_time, is_closed, reason')
          .eq('business_id', businessId)
          .gte('date', from)
          .lte('date', to),
      );
    },
    async insertOverride(businessId, values) {
      return one(
        await t('availability_overrides')
          .insert({ ...values, business_id: businessId })
          .select('id, business_id, staff_id, date, start_time, end_time, is_closed, reason')
          .single(),
        'Override',
      );
    },
    async deleteOverride(businessId, overrideId) {
      const res = await t('availability_overrides')
        .delete({ count: 'exact' })
        .eq('business_id', businessId)
        .eq('id', overrideId);
      return count(res) > 0;
    },

    async countAppointments(businessId, filter) {
      let q = t('appointments').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
      if (filter.serviceId) q = q.eq('service_id', filter.serviceId);
      if (filter.staffId) q = q.eq('staff_id', filter.staffId);
      return count(await q);
    },

    // ----- appointments -----
    async listBusy(businessId, staffIds, fromIso, toIso) {
      if (staffIds.length === 0) return [];
      return rows(
        await t('appointments')
          .select('id, staff_id, blocked')
          .eq('business_id', businessId)
          .in('staff_id', staffIds)
          .neq('status', 'cancelled')
          .overlaps('blocked', serializeTsRange(fromIso, toIso)),
      );
    },
    async getAppointment(businessId, appointmentId) {
      return maybe(
        await t('appointments').select(APPOINTMENT_COLS).eq('business_id', businessId).eq('id', appointmentId).maybeSingle(),
      );
    },
    async findAppointmentByIdempotencyKey(businessId, key) {
      return maybe(
        await t('appointments').select(APPOINTMENT_COLS).eq('business_id', businessId).eq('idempotency_key', key).maybeSingle(),
      );
    },
    async listAppointmentsInWindow(businessId, f) {
      let q = t('appointments')
        .select(APPOINTMENT_COLS)
        .eq('business_id', businessId)
        .gte('starts_at', f.fromIso)
        .lt('starts_at', f.toIso);
      if (f.staffId) q = q.eq('staff_id', f.staffId);
      if (f.clientId) q = q.eq('client_id', f.clientId);
      if (f.status) q = q.eq('status', f.status);
      if (f.after) {
        // keyset: (starts_at, id) > (after.startsAt, after.id)
        q = q.or(`starts_at.gt.${f.after.startsAt},and(starts_at.eq.${f.after.startsAt},id.gt.${f.after.id})`);
      }
      return rows(await q.order('starts_at').order('id').limit(f.limit));
    },
    async listUpcomingAppointments(businessId, clientId, nowIso) {
      return rows(
        await t('appointments')
          .select(APPOINTMENT_COLS)
          .eq('business_id', businessId)
          .eq('client_id', clientId)
          .eq('status', 'confirmed')
          .rangeGt('slot', `[${nowIso},${nowIso}]`)
          .order('slot'),
      );
    },
    async createAppointment(a) {
      return rpcRow(
        await db.rpc('create_appointment', {
          p_business_id: a.businessId,
          p_client_id: a.clientId,
          p_staff_id: a.staffId,
          p_service_id: a.serviceId,
          p_starts_at: a.startsAt,
          p_source: a.source,
          p_idempotency_key: a.idempotencyKey,
          p_actor: a.actor,
          p_actor_id: a.actorId ?? '',
          p_notes: a.notes ?? undefined,
        }),
        'Appointment',
      );
    },
    async rescheduleAppointment(a) {
      return rpcRow(
        await db.rpc('reschedule_appointment', {
          p_appointment_id: a.appointmentId,
          p_starts_at: a.startsAt,
          p_staff_id: a.staffId ?? undefined,
          p_actor: a.actor,
          p_actor_id: a.actorId ?? '',
        }),
        'Appointment',
      );
    },
    async cancelAppointment(a) {
      return rpcRow(
        await db.rpc('cancel_appointment', {
          p_appointment_id: a.appointmentId,
          p_actor: a.actor,
          p_actor_id: a.actorId ?? '',
          p_reason: a.reason ?? undefined,
        }),
        'Appointment',
      );
    },
    async setAppointmentStatus(a) {
      return rpcRow(
        await db.rpc('set_appointment_status', {
          p_appointment_id: a.appointmentId,
          p_status: a.status,
          p_actor: a.actor,
          p_actor_id: a.actorId ?? '',
        }),
        'Appointment',
      );
    },
    async checkInAppointment(appointmentId, actorId) {
      return rpcRow(
        await db.rpc('check_in_appointment', { p_appointment_id: appointmentId, p_actor_id: actorId ?? '' }),
        'Appointment',
      );
    },
    async updateAppointmentNotes(businessId, appointmentId, notes) {
      return maybe(
        await t('appointments')
          .update({ notes })
          .eq('business_id', businessId)
          .eq('id', appointmentId)
          .select(APPOINTMENT_COLS)
          .maybeSingle(),
      );
    },

    // ----- clients -----
    async getClient(businessId, clientId) {
      return maybe(await t('clients').select(CLIENT_COLS).eq('business_id', businessId).eq('id', clientId).maybeSingle());
    },
    async findClientByPhone(businessId, phoneE164) {
      return maybe(
        await t('clients').select(CLIENT_COLS).eq('business_id', businessId).eq('phone_e164', phoneE164).maybeSingle(),
      );
    },
    async listClientsByIds(businessId, clientIds) {
      if (clientIds.length === 0) return [];
      return rows(await t('clients').select(CLIENT_COLS).eq('business_id', businessId).in('id', clientIds));
    },
    async upsertClientByPhone(businessId, phoneE164, name) {
      return rpcRow(
        await db.rpc('upsert_client_by_phone', { p_business_id: businessId, p_phone_e164: phoneE164, p_name: name ?? undefined }),
        'Client',
      );
    },
    async updateClient(businessId, clientId, patch) {
      return maybe(
        await t('clients').update(patch).eq('business_id', businessId).eq('id', clientId).select(CLIENT_COLS).maybeSingle(),
      );
    },
    async insertClientNote(businessId, values) {
      return one(
        await t('client_notes')
          .insert({ ...values, business_id: businessId })
          .select('id, business_id, client_id, body, kind, created_by, created_at')
          .single(),
        'Client note',
      );
    },
    async deleteClientNote(businessId, clientId, noteId) {
      const res = await t('client_notes')
        .delete({ count: 'exact' })
        .eq('business_id', businessId)
        .eq('client_id', clientId)
        .eq('id', noteId);
      return count(res) > 0;
    },

    // ----- members -----
    async getUser(userId) {
      return maybe(
        await t('users').select('id, business_id, role, email, display_name, avatar_url').eq('id', userId).maybeSingle(),
      );
    },
    async upsertDeviceToken(businessId, userId, token, platform) {
      check(
        await t('device_push_tokens').upsert(
          { business_id: businessId, user_id: userId, token, platform },
          { onConflict: 'token' },
        ),
      );
    },

    async recordAudit(e) {
      check(
        await db.rpc('record_audit_event', {
          p_business_id: e.businessId,
          p_actor_id: e.actorId,
          p_action: e.action,
          p_entity: e.entity,
          p_entity_id: e.entityId,
          ...(e.diff ? { p_diff: e.diff as Json } : {}),
          ...(e.requestId ? { p_request_id: e.requestId } : {}),
        }),
      );
    },

    // ----- attempts -----
    async insertAttempt(values) {
      return one(await t('booking_attempts').insert(values).select(ATTEMPT_COLS).single(), 'Attempt');
    },
    async getAttempt(attemptId) {
      return maybe(await t('booking_attempts').select(ATTEMPT_COLS).eq('id', attemptId).maybeSingle());
    },
    async updateAttempt(businessId, attemptId, patch) {
      return one(
        await t('booking_attempts')
          .update(patch as TablesUpdate<'booking_attempts'>)
          .eq('business_id', businessId)
          .eq('id', attemptId)
          .select(ATTEMPT_COLS)
          .maybeSingle(),
        'Attempt',
      );
    },

    // ----- identity (Clerk mirror) -----
    async getBusinessByOrgId(orgId) {
      return maybe(await t('businesses').select(BUSINESS_COLS).eq('clerk_org_id', orgId).maybeSingle());
    },
    async insertBusiness(values) {
      return one(await t('businesses').insert(values).select(BUSINESS_COLS).single(), 'Business');
    },
    async updateBusinessByOrgId(orgId, patch) {
      check(await t('businesses').update(patch).eq('clerk_org_id', orgId));
    },
    async deleteBusinessByOrgId(orgId) {
      check(await t('businesses').delete().eq('clerk_org_id', orgId));
    },
    async isSlugTaken(slug, exceptBusinessId) {
      let q = t('businesses').select('id', { count: 'exact', head: true }).eq('slug', slug);
      if (exceptBusinessId) q = q.neq('id', exceptBusinessId);
      return count(await q) > 0;
    },
    async upsertUser(values) {
      check(await t('users').upsert(values, { onConflict: 'id' }));
    },
    async deleteUser(userId) {
      check(await t('users').delete().eq('id', userId));
    },
    async unlinkStaffUser(userId, businessId) {
      let q = t('staff').update({ user_id: null }).eq('user_id', userId);
      if (businessId) q = q.eq('business_id', businessId);
      check(await q);
    },
    async detachBusinessUsers(businessId) {
      check(await t('users').update({ business_id: null }).eq('business_id', businessId));
    },
    async recordWebhookEvent(source, eventKey, payload) {
      const cols = 'id, source, event_key, payload, received_at, processed_at, error, attempts';
      const inserted = await t('webhook_events').insert({ source, event_key: eventKey, payload: payload as Json }).select(cols).single();
      if (!inserted.error) return { row: inserted.data as WebhookEventRow, duplicate: false };
      if (inserted.error.code !== '23505') throw mapDbError(inserted.error);
      const existing = one<WebhookEventRow>(
        await t('webhook_events').select(cols).eq('source', source).eq('event_key', eventKey).maybeSingle(),
        'Webhook event',
      );
      return { row: existing, duplicate: true };
    },
    async finishWebhookEvent(id, result) {
      check(
        await t('webhook_events')
          .update({ processed_at: result.processedAt, error: result.error, attempts: result.attempts })
          .eq('id', id),
      );
    },

    // ----- maintenance (global by design) -----
    async deleteExpiredIdempotencyKeys(nowIso) {
      return count(await t('idempotency_keys').delete({ count: 'exact' }).lt('expires_at', nowIso));
    },
    async pruneProcessedWebhookEvents(beforeIso) {
      return count(await t('webhook_events').delete({ count: 'exact' }).lt('processed_at', beforeIso));
    },
    async abandonStaleAttempts(channel, startedBeforeIso) {
      return count(
        await t('booking_attempts')
          .update({ outcome: 'abandoned' }, { count: 'exact' })
          .eq('channel', channel)
          .eq('outcome', 'in_progress')
          .lt('started_at', startedBeforeIso),
      );
    },
  };
}
