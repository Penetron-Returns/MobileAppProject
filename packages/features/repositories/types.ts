/**
 * Persistence contracts for the booking schema, split by area. The Supabase
 * implementation is ./supabase.ts; the in-memory fake lives in @booking/testing.
 */
import type {
  AppointmentSource,
  ClientConfirmationChannel,
  AppointmentStatus,
  AvailabilityRuleInput,
  BusinessHoursRow,
  UUID,
} from '@booking/types';
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
  SpecialDayRow,
  StaffBreakRow,
  StaffRow,
  StaffServiceRow,
  TimeOffRow,
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
export type SpecialDayValues = Omit<SpecialDayRow, 'id' | 'business_id'>;
export type StaffBreakValues = Omit<StaffBreakRow, 'id' | 'business_id' | 'staff_id'>;
export type TimeOffValues = Omit<TimeOffRow, 'id' | 'business_id' | 'staff_id'>;
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
  /** Default 'asc'. 'desc' is newest first and does not combine with `after`. */
  order?: 'asc' | 'desc';
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

export interface VoidArgs extends ActorRef {
  appointmentId: UUID;
}

/** A held appointment whose hold has just been claimed (and cleared) by the hold job */
export interface DueClientNotification {
  appointment_id: UUID;
  business_id: UUID;
  client_id: UUID;
  status: AppointmentStatus;
  voided: boolean;
}

export interface SetStatusArgs extends ActorRef {
  appointmentId: UUID;
  status: Extract<AppointmentStatus, 'completed' | 'no_show'>;
}

export interface ConfirmByClientArgs extends ActorRef {
  businessId: UUID;
  appointmentId: UUID;
  confirmedAt: string;
  via: ClientConfirmationChannel;
  idempotencyKey: string | null;
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

/** Special days, staff breaks and time off (docs/booking-core.md rule order). */
export interface ScheduleRepository {
  /** Special days with date in [from, to], ordered by date */
  listSpecialDays(businessId: UUID, from: string, to: string): Promise<SpecialDayRow[]>;
  getSpecialDay(businessId: UUID, specialDayId: UUID): Promise<SpecialDayRow | null>;
  /** A second special day on the same date fails with VALIDATION_FAILED (unique business + date) */
  insertSpecialDay(businessId: UUID, values: SpecialDayValues): Promise<SpecialDayRow>;
  updateSpecialDay(businessId: UUID, specialDayId: UUID, patch: Partial<SpecialDayValues>): Promise<SpecialDayRow | null>;
  deleteSpecialDay(businessId: UUID, specialDayId: UUID): Promise<boolean>;

  /** Breaks of the given staff, ordered by (start_time, label, id) */
  listStaffBreaks(businessId: UUID, staffIds: UUID[]): Promise<StaffBreakRow[]>;
  /** RPC replace_staff_breaks (caller verified ownership); overlapping breaks → RULE_VIOLATION OVERLAPPING_BREAKS */
  replaceStaffBreaks(businessId: UUID, staffId: UUID, breaks: StaffBreakValues[]): Promise<StaffBreakRow[]>;

  /** Time off overlapping [from, to] (inclusive dates), optionally for some staff, ordered by (starts_on, id) */
  listTimeOff(businessId: UUID, from: string, to: string, staffIds?: UUID[]): Promise<TimeOffRow[]>;
  getTimeOff(businessId: UUID, timeOffId: UUID): Promise<TimeOffRow | null>;
  insertTimeOff(businessId: UUID, staffId: UUID, values: TimeOffValues): Promise<TimeOffRow>;
  updateTimeOff(businessId: UUID, timeOffId: UUID, patch: Partial<TimeOffValues>): Promise<TimeOffRow | null>;
  deleteTimeOff(businessId: UUID, timeOffId: UUID): Promise<boolean>;
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
  /** Cancels as a VOID (RPC void_appointment): no fee, no penalty, excluded from stats; writes a `voided` event */
  voidAppointment(args: VoidArgs): Promise<AppointmentRow>;
  /** Holds the client notifications of an appointment until `untilIso` (client_notify_after), business-scoped */
  holdClientNotification(businessId: UUID, appointmentId: UUID, untilIso: string): Promise<void>;
  /** Atomically claims (and clears) holds due at `nowIso`: UPDATE ... RETURNING, so each is returned once */
  claimDueClientNotifications(nowIso: string, limit: number): Promise<DueClientNotification[]>;
  setAppointmentStatus(args: SetStatusArgs): Promise<AppointmentRow>;
  /** Id of the newest `appointment_events` row of this type for the appointment (outbound event idempotency) */
  findLatestAppointmentEventId(appointmentId: UUID, type: string): Promise<UUID | null>;
  /** Idempotent, business-scoped; a non-confirmed or already confirmed appointment comes back unchanged */
  confirmAppointmentByClient(args: ConfirmByClientArgs): Promise<AppointmentRow>;
  checkInAppointment(appointmentId: UUID, actorId: string | null): Promise<AppointmentRow>;
  updateAppointmentNotes(businessId: UUID, appointmentId: UUID, notes: string | null): Promise<AppointmentRow | null>;
}

export interface ClientRepository {
  getClient(businessId: UUID, clientId: UUID): Promise<ClientRow | null>;
  findClientByPhone(businessId: UUID, phoneE164: string): Promise<ClientRow | null>;
  /** Most recently seen client with this (already lower-cased) email, compared case-insensitively */
  findClientByEmail(businessId: UUID, emailLower: string): Promise<ClientRow | null>;
  /** Clients whose name matches ANY LIKE pattern (`%`, `_`; case-insensitive), most recently seen first, at most `limit` */
  listClientsByNamePatterns(businessId: UUID, patterns: string[], limit: number): Promise<ClientRow[]>;
  /** Clients by id, in no particular order; unknown ids are skipped */
  listClientsByIds(businessId: UUID, clientIds: UUID[]): Promise<ClientRow[]>;
  /**
   * Start (ISO) of each client's latest `completed` appointment that started before `beforeIso`, in one
   * business-scoped query. Clients with none are absent from the result.
   */
  lastCompletedVisitByClient(businessId: UUID, clientIds: UUID[], beforeIso: string): Promise<Record<UUID, string>>;
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
  /** Removes one token, only if it belongs to this user (sign-out); a no-op otherwise */
  deleteDeviceToken(businessId: UUID, userId: string, token: string): Promise<void>;
  /** Removes every Expo push token of the user (account deletion) */
  deleteDeviceTokensForUser(userId: string): Promise<void>;
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
    ScheduleRepository,
    AppointmentRepository,
    ClientRepository,
    MemberRepository,
    AttemptRepository,
    IdentityRepository,
    MaintenanceRepository {}
