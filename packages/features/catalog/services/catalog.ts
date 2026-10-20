/**
 * Business catalogue and settings behind /v1: business details and hours, services,
 * staff, availability and overrides, and the /me payload. Every function takes the
 * caller's business id and verifies ownership of referenced rows.
 */
import type {
  AvailabilityRuleInput,
  BusinessDTO,
  BusinessHoursRow,
  CreateOverrideRequest,
  CreateServiceRequest,
  CreateStaffRequest,
  MeDTO,
  MemberRole,
  ServiceDTO,
  StaffDayOverrideDTO,
  StaffDTO,
  UpdateBusinessRequest,
  UpdateServiceRequest,
  UpdateStaffRequest,
  UUID,
} from '@booking/types';
import { AppError, notFound } from '../../lib/errors.ts';
import { normalizePhone } from '../../lib/phone.ts';
import { businessPhoneRegion, regionForBusiness } from '../../lib/region.ts';
import { pick } from '../../lib/pick.ts';
import { normaliseTimeOfDay } from '../../lib/time.ts';
import { findRepeatedWeekday } from '../../availability/lib/hours.ts';
import { toStaffDayOverrideDTO } from '../../availability/lib/mappers.ts';
import { bookingRules, toBusinessDTO, toBusinessHours, toServiceDTO, toStaffDTO } from '../../bookings/lib/mappers.ts';
import type { BookingRepository, ServiceValues, StaffValues } from '../../repositories/types.ts';
import type { BusinessRow } from '../../repositories/rows.ts';

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

export async function updateBusiness(
  repo: BookingRepository,
  businessId: UUID,
  req: UpdateBusinessRequest,
  /** Owner making the change; recorded in audit_log when the attendance mode changes */
  actorId?: string,
): Promise<BusinessDTO> {
  const current = await requireBusiness(repo, businessId);
  const patch = {
    ...pick(req, ['name', 'slug', 'timezone', 'currency', 'logo_url', 'address', 'phone', 'email', 'attendance_mode'] as const),
    ...(req.booking_rules ? { booking_rules: { ...bookingRules(current), ...req.booking_rules } } : {}),
  };
  if (typeof patch.phone === 'string') {
    const locale = { timezone: patch.timezone ?? current.timezone, currency: patch.currency ?? current.currency };
    patch.phone = normalizePhone(patch.phone, regionForBusiness(locale));
  }
  if (Object.keys(patch).length === 0) return toBusinessDTO(current);
  const updated = await repo.updateBusiness(businessId, patch);
  if (actorId && patch.attendance_mode && patch.attendance_mode !== current.attendance_mode) {
    await repo.recordAudit({
      businessId,
      actorId,
      action: 'update',
      entity: 'attendance_mode',
      entityId: businessId,
      diff: { attendance_mode: { old: current.attendance_mode, new: patch.attendance_mode } },
    });
  }
  return toBusinessDTO(updated);
}

export async function replaceBusinessHours(
  repo: BookingRepository,
  businessId: UUID,
  hours: BusinessHoursRow[],
): Promise<BusinessHoursRow[]> {
  if (findRepeatedWeekday(hours) !== null) {
    throw new AppError('VALIDATION_FAILED', 'Opening hours allow one range per weekday; use a staff break for a lunch gap');
  }
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
    phone: req.phone ? normalizePhone(req.phone, await businessPhoneRegion(repo, businessId)) : null,
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
  if (typeof patch.phone === 'string') patch.phone = normalizePhone(patch.phone, await businessPhoneRegion(repo, businessId));
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
  if (findRepeatedWeekday(rules) !== null) {
    throw new AppError('VALIDATION_FAILED', 'Working hours allow one range per weekday; use a break for a gap');
  }
  const normalised = rules.map((r) => ({
    weekday: r.weekday,
    start_time: normaliseTimeOfDay(r.start_time),
    end_time: normaliseTimeOfDay(r.end_time),
  }));
  await repo.replaceStaffAvailability(businessId, staffId, normalised);
  return { staff_id: staffId, rules: normalised };
}

// ---------- overrides ----------

/** A per-staff day override. Business-wide closed days and special hours are special days (POST /v1/special-days). */
export async function createOverride(
  repo: BookingRepository,
  businessId: UUID,
  req: CreateOverrideRequest,
): Promise<StaffDayOverrideDTO> {
  if (!req.staff_id) {
    throw new AppError('VALIDATION_FAILED', 'staff_id is required; use POST /v1/special-days for business-wide days');
  }
  await requireStaff(repo, businessId, req.staff_id);
  const row = await repo.insertOverride(businessId, {
    staff_id: req.staff_id,
    date: req.date,
    is_closed: req.is_closed,
    start_time: req.is_closed ? null : normaliseTimeOfDay(req.start_time!),
    end_time: req.is_closed ? null : normaliseTimeOfDay(req.end_time!),
    reason: req.reason ?? null,
  });
  return toStaffDayOverrideDTO(row);
}

export async function deleteOverride(repo: BookingRepository, businessId: UUID, overrideId: UUID): Promise<{ id: UUID }> {
  if (!(await repo.deleteOverride(businessId, overrideId))) throw notFound('Override');
  return { id: overrideId };
}
