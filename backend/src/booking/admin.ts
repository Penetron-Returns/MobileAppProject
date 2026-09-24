/**
 * Owner/staff management operations behind /v1 (everything that is not
 * availability or the booking lifecycle in BookingService). Every function
 * takes the caller's business id and verifies ownership of referenced rows.
 */
import type {
  AppointmentDTO,
  AvailabilityRuleInput,
  BusinessDTO,
  BusinessHoursRow,
  ClientDTO,
  ClientNoteDTO,
  CreateClientNoteRequest,
  CreateClientRequest,
  CreateOverrideRequest,
  CreateServiceRequest,
  CreateStaffRequest,
  MeDTO,
  MemberRole,
  ServiceDTO,
  StaffDTO,
  UpdateBusinessRequest,
  UpdateClientRequest,
  UpdateServiceRequest,
  UpdateStaffRequest,
  UUID,
} from '../../../shared/api.ts';
import { AppError, notFound } from '../lib/errors.ts';
import { normalizePhone } from '../lib/phone.ts';
import { normaliseTimeOfDay } from '../lib/time.ts';
import type { Actor } from '../ports.ts';
import {
  bookingRules,
  toAppointmentDTO,
  toBusinessDTO,
  toBusinessHours,
  toClientDTO,
  toClientNoteDTO,
  toServiceDTO,
  toStaffDTO,
} from './mappers.ts';
import type { BookingRepository, ClientPatch, ServiceValues, StaffValues } from './repository.ts';
import type { BusinessRow, OverrideRow } from './rows.ts';

/** Not in shared/api.ts (additive, WS-B only): response of POST /v1/overrides. */
export interface OverrideDTO {
  id: UUID;
  staff_id: UUID | null;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

/** Response of DELETE /v1/services/:id and /v1/staff/:id. */
export interface DeleteResult {
  id: UUID;
  /** false = still referenced by appointments, so it was deactivated instead */
  deleted: boolean;
}

/** Create inputs: DTO fields with defaults may be omitted. */
export type CreateServiceInput = Partial<CreateServiceRequest> &
  Pick<CreateServiceRequest, 'name' | 'duration_minutes' | 'price_cents'>;
export type CreateStaffInput = Partial<CreateStaffRequest> & Pick<CreateStaffRequest, 'name'>;

/** Copies only the keys that are present (PATCH semantics). */
function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

async function requireBusiness(repo: BookingRepository, businessId: UUID): Promise<BusinessRow> {
  const row = await repo.getBusiness(businessId);
  if (!row) throw notFound('Business');
  return row;
}

async function assertStaffIds(repo: BookingRepository, businessId: UUID, ids: UUID[]) {
  const known = new Set((await repo.listStaff(businessId)).map((s) => s.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new AppError('VALIDATION_FAILED', 'Unknown staff id', { staff_ids: unknown });
}

async function assertServiceIds(repo: BookingRepository, businessId: UUID, ids: UUID[]) {
  const known = new Set((await repo.listServices(businessId)).map((s) => s.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new AppError('VALIDATION_FAILED', 'Unknown service id', { service_ids: unknown });
}

async function requireStaff(repo: BookingRepository, businessId: UUID, staffId: UUID) {
  const staff = await repo.getStaff(businessId, staffId);
  if (!staff) throw notFound('Staff');
  return staff;
}

const unique = <T>(values: T[]) => [...new Set(values)];

// ---------- me ----------

export async function getMe(
  repo: BookingRepository,
  auth: { userId: string; businessId: UUID; role: MemberRole },
): Promise<MeDTO> {
  const [user, business] = await Promise.all([repo.getUser(auth.userId), requireBusiness(repo, auth.businessId)]);
  return {
    user: {
      id: auth.userId,
      email: user?.email ?? null,
      display_name: user?.display_name ?? null,
      avatar_url: user?.avatar_url ?? null,
    },
    business: toBusinessDTO(business),
    // The session token is authoritative; the users row is a webhook mirror that may lag.
    role: auth.role,
  };
}

// ---------- business ----------

export async function updateBusiness(repo: BookingRepository, businessId: UUID, req: UpdateBusinessRequest): Promise<BusinessDTO> {
  const current = await requireBusiness(repo, businessId);
  const patch = {
    ...pick(req, ['name', 'slug', 'timezone', 'currency', 'logo_url', 'address', 'phone', 'email'] as const),
    ...(req.booking_rules ? { booking_rules: { ...bookingRules(current), ...req.booking_rules } } : {}),
  };
  if (typeof patch.phone === 'string') patch.phone = normalizePhone(patch.phone);
  if (Object.keys(patch).length === 0) return toBusinessDTO(current);
  return toBusinessDTO(await repo.updateBusiness(businessId, patch));
}

export async function replaceBusinessHours(
  repo: BookingRepository,
  businessId: UUID,
  hours: BusinessHoursRow[],
): Promise<BusinessHoursRow[]> {
  await repo.replaceBusinessHours(
    businessId,
    hours.map((h) => ({ weekday: h.weekday, opens_at: normaliseTimeOfDay(h.opens_at), closes_at: normaliseTimeOfDay(h.closes_at) })),
  );
  return (await repo.listBusinessHours(businessId)).map(toBusinessHours);
}

// ---------- services ----------

const SERVICE_KEYS = [
  'name',
  'description',
  'category',
  'duration_minutes',
  'price_cents',
  'deposit_cents',
  'is_active',
  'sort_order',
] as const;

export async function createService(repo: BookingRepository, businessId: UUID, req: CreateServiceInput): Promise<ServiceDTO> {
  const staffIds = unique(req.staff_ids ?? []);
  await assertStaffIds(repo, businessId, staffIds);
  const values: ServiceValues = {
    name: req.name,
    description: req.description ?? null,
    category: req.category ?? null,
    duration_minutes: req.duration_minutes,
    price_cents: req.price_cents,
    deposit_cents: req.deposit_cents ?? 0,
    is_active: req.is_active ?? true,
    sort_order: req.sort_order ?? 0,
  };
  const row = await repo.insertService(businessId, values);
  if (staffIds.length) await repo.setServiceStaff(businessId, row.id, staffIds);
  return toServiceDTO(row);
}

export async function updateService(
  repo: BookingRepository,
  businessId: UUID,
  serviceId: UUID,
  req: UpdateServiceRequest,
): Promise<ServiceDTO> {
  const existing = await repo.getService(businessId, serviceId);
  if (!existing) throw notFound('Service');
  if (req.staff_ids) await assertStaffIds(repo, businessId, req.staff_ids);
  const patch = pick(req, SERVICE_KEYS);
  const row = Object.keys(patch).length ? await repo.updateService(businessId, serviceId, patch) : existing;
  if (!row) throw notFound('Service');
  if (req.staff_ids) await repo.setServiceStaff(businessId, serviceId, unique(req.staff_ids));
  return toServiceDTO(row);
}

/** Hard delete, or soft (is_active=false) when appointments reference the service. */
export async function deleteService(repo: BookingRepository, businessId: UUID, serviceId: UUID): Promise<DeleteResult> {
  if (!(await repo.getService(businessId, serviceId))) throw notFound('Service');
  if ((await repo.countAppointments(businessId, { serviceId })) > 0) {
    await repo.updateService(businessId, serviceId, { is_active: false });
    return { id: serviceId, deleted: false };
  }
  await repo.deleteService(businessId, serviceId);
  return { id: serviceId, deleted: true };
}

// ---------- staff ----------

const STAFF_KEYS = [
  'user_id',
  'name',
  'title',
  'photo_url',
  'phone',
  'email',
  'color',
  'is_active',
  'accepts_bookings',
  'sort_order',
] as const;

export async function createStaff(repo: BookingRepository, businessId: UUID, req: CreateStaffInput): Promise<StaffDTO> {
  const serviceIds = unique(req.service_ids ?? []);
  await assertServiceIds(repo, businessId, serviceIds);
  const values: StaffValues = {
    user_id: req.user_id ?? null,
    name: req.name,
    title: req.title ?? null,
    photo_url: req.photo_url ?? null,
    phone: req.phone ? normalizePhone(req.phone) : null,
    email: req.email ?? null,
    color: req.color ?? null,
    is_active: req.is_active ?? true,
    accepts_bookings: req.accepts_bookings ?? true,
    sort_order: req.sort_order ?? 0,
  };
  const row = await repo.insertStaff(businessId, values);
  if (serviceIds.length) await repo.replaceStaffServices(businessId, row.id, serviceIds);
  return toStaffDTO(row);
}

export async function updateStaff(
  repo: BookingRepository,
  businessId: UUID,
  staffId: UUID,
  req: UpdateStaffRequest,
): Promise<StaffDTO> {
  const existing = await requireStaff(repo, businessId, staffId);
  if (req.service_ids) await assertServiceIds(repo, businessId, req.service_ids);
  const patch = pick(req, STAFF_KEYS);
  if (typeof patch.phone === 'string') patch.phone = normalizePhone(patch.phone);
  const row = Object.keys(patch).length ? await repo.updateStaff(businessId, staffId, patch) : existing;
  if (!row) throw notFound('Staff');
  if (req.service_ids) await repo.replaceStaffServices(businessId, staffId, unique(req.service_ids));
  return toStaffDTO(row);
}

/** Hard delete, or deactivate (inactive + not bookable) when appointments reference the staff member. */
export async function deleteStaff(repo: BookingRepository, businessId: UUID, staffId: UUID): Promise<DeleteResult> {
  await requireStaff(repo, businessId, staffId);
  if ((await repo.countAppointments(businessId, { staffId })) > 0) {
    await repo.updateStaff(businessId, staffId, { is_active: false, accepts_bookings: false });
    return { id: staffId, deleted: false };
  }
  await repo.deleteStaff(businessId, staffId);
  return { id: staffId, deleted: true };
}

export async function replaceStaffServices(
  repo: BookingRepository,
  businessId: UUID,
  staffId: UUID,
  serviceIds: UUID[],
): Promise<{ staff_id: UUID; service_ids: UUID[] }> {
  await requireStaff(repo, businessId, staffId);
  const ids = unique(serviceIds);
  await assertServiceIds(repo, businessId, ids);
  await repo.replaceStaffServices(businessId, staffId, ids);
  return { staff_id: staffId, service_ids: ids };
}

export async function replaceStaffAvailability(
  repo: BookingRepository,
  businessId: UUID,
  staffId: UUID,
  rules: AvailabilityRuleInput[],
): Promise<{ staff_id: UUID; rules: AvailabilityRuleInput[] }> {
  await requireStaff(repo, businessId, staffId);
  const normalised = rules.map((r) => ({
    weekday: r.weekday,
    start_time: normaliseTimeOfDay(r.start_time),
    end_time: normaliseTimeOfDay(r.end_time),
  }));
  await repo.replaceStaffAvailability(businessId, staffId, normalised);
  return { staff_id: staffId, rules: normalised };
}

// ---------- overrides ----------

function toOverrideDTO(row: OverrideRow): OverrideDTO {
  return {
    id: row.id,
    staff_id: row.staff_id,
    date: row.date,
    is_closed: row.is_closed,
    start_time: row.start_time ? normaliseTimeOfDay(row.start_time) : null,
    end_time: row.end_time ? normaliseTimeOfDay(row.end_time) : null,
    reason: row.reason,
  };
}

export async function createOverride(repo: BookingRepository, businessId: UUID, req: CreateOverrideRequest): Promise<OverrideDTO> {
  if (req.staff_id) await requireStaff(repo, businessId, req.staff_id);
  const row = await repo.insertOverride(businessId, {
    staff_id: req.staff_id ?? null,
    date: req.date,
    is_closed: req.is_closed,
    start_time: req.is_closed ? null : normaliseTimeOfDay(req.start_time!),
    end_time: req.is_closed ? null : normaliseTimeOfDay(req.end_time!),
    reason: req.reason ?? null,
  });
  return toOverrideDTO(row);
}

export async function deleteOverride(repo: BookingRepository, businessId: UUID, overrideId: UUID): Promise<{ id: UUID }> {
  if (!(await repo.deleteOverride(businessId, overrideId))) throw notFound('Override');
  return { id: overrideId };
}

// ---------- clients ----------

/**
 * Upsert by phone via RPC upsert_client_by_phone, then apply the provided
 * fields. `onlyFillBlank` (public web booking) never overwrites existing data.
 */
export async function upsertClient(
  repo: BookingRepository,
  businessId: UUID,
  req: CreateClientRequest,
  opts: { onlyFillBlank?: boolean } = {},
): Promise<ClientDTO> {
  const phone = normalizePhone(req.phone);
  const row = await repo.upsertClientByPhone(businessId, phone, req.name ?? null);
  const wanted: ClientPatch = pick(req, ['name', 'email', 'notes', 'tags'] as const);
  const patch: ClientPatch = opts.onlyFillBlank
    ? Object.fromEntries(Object.entries(wanted).filter(([k]) => row[k as keyof ClientPatch] === null))
    : wanted;
  const changed = Object.entries(patch).some(([k, v]) => JSON.stringify(row[k as keyof ClientPatch]) !== JSON.stringify(v));
  if (!changed) return toClientDTO(row);
  const updated = await repo.updateClient(businessId, row.id, patch);
  if (!updated) throw notFound('Client');
  return toClientDTO(updated);
}

export async function updateClient(
  repo: BookingRepository,
  businessId: UUID,
  clientId: UUID,
  req: UpdateClientRequest,
): Promise<ClientDTO> {
  const patch: ClientPatch = pick(req, ['name', 'email', 'notes', 'tags', 'is_blocked', 'whatsapp_opt_in'] as const);
  if (req.phone !== undefined) patch.phone_e164 = normalizePhone(req.phone);
  const row = Object.keys(patch).length
    ? await repo.updateClient(businessId, clientId, patch)
    : await repo.getClient(businessId, clientId);
  if (!row) throw notFound('Client');
  return toClientDTO(row);
}

export async function addClientNote(
  repo: BookingRepository,
  businessId: UUID,
  clientId: UUID,
  userId: string,
  req: CreateClientNoteRequest,
): Promise<ClientNoteDTO> {
  if (!(await repo.getClient(businessId, clientId))) throw notFound('Client');
  const row = await repo.insertClientNote(businessId, {
    client_id: clientId,
    body: req.body,
    kind: req.kind ?? 'general',
    created_by: userId,
  });
  return toClientNoteDTO(row);
}

export async function deleteClientNote(
  repo: BookingRepository,
  businessId: UUID,
  clientId: UUID,
  noteId: UUID,
): Promise<{ id: UUID }> {
  if (!(await repo.deleteClientNote(businessId, clientId, noteId))) throw notFound('Client note');
  return { id: noteId };
}

// ---------- appointment extras (no availability involved) ----------

async function requireAppointment(repo: BookingRepository, businessId: UUID, appointmentId: UUID) {
  const row = await repo.getAppointment(businessId, appointmentId);
  if (!row) throw notFound('Appointment');
  return row;
}

export async function setAppointmentStatus(
  repo: BookingRepository,
  businessId: UUID,
  appointmentId: UUID,
  status: 'completed' | 'no_show',
  actor: Actor,
): Promise<AppointmentDTO> {
  await requireAppointment(repo, businessId, appointmentId);
  return toAppointmentDTO(
    await repo.setAppointmentStatus({ appointmentId, status, actor: actor.type, actorId: actor.id }),
  );
}

export async function checkInAppointment(
  repo: BookingRepository,
  businessId: UUID,
  appointmentId: UUID,
  userId: string,
): Promise<AppointmentDTO> {
  await requireAppointment(repo, businessId, appointmentId);
  return toAppointmentDTO(await repo.checkInAppointment(appointmentId, userId));
}

export async function updateAppointmentNotes(
  repo: BookingRepository,
  businessId: UUID,
  appointmentId: UUID,
  notes: string | null,
): Promise<AppointmentDTO> {
  const row = await repo.updateAppointmentNotes(businessId, appointmentId, notes);
  if (!row) throw notFound('Appointment');
  return toAppointmentDTO(row);
}

// ---------- devices ----------

export async function registerDevice(
  repo: BookingRepository,
  businessId: UUID,
  userId: string,
  token: string,
  platform: string,
): Promise<{ token: string; platform: string }> {
  await repo.upsertDeviceToken(businessId, userId, token, platform);
  return { token, platform };
}
