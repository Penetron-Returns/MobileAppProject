/**
 * BookingService (src/ports.ts) over a BookingRepository.
 * Availability is always computed live from the repository; writes go
 * through the SQL RPCs, which remain the final guard (exclusion constraint).
 */
import type { AvailableSlotsResponse, ISODate, ServiceDTO, StaffDTO, UUID } from '../../../../packages/shared/api.ts';
import { AppError, notFound, ruleViolation } from '../lib/errors.ts';
import { createLogger, type Logger } from '../lib/logger.ts';
import { addDays, dateInZone, dayBoundsInZone, rangeBounds } from '../lib/time.ts';
import type {
  Actor,
  AppointmentChangeKind,
  BookingService,
  CancelAppointmentInput,
  CreateAppointmentInput,
  NotificationService,
  RescheduleAppointmentInput,
} from '../ports.ts';
import {
  bookableDateRange,
  computeSlots,
  findSlot,
  freeStaffIgnoringHours,
  listAvailableDays as engineListDays,
  type AvailabilityInput,
} from './availability.ts';
import { bookingRules, toAppointmentDTO, toBusinessDTO, toServiceDTO, toStaffDTO } from './mappers.ts';
import type { BookingRepository } from './repository.ts';
import type { AppointmentRow, BusinessRow, ServiceRow, StaffRow } from './rows.ts';

export interface BookingServiceOptions {
  repository: BookingRepository;
  notifications: NotificationService;
  logger?: Logger;
  /** Default clock when a call does not pass `now` */
  clock?: () => Date;
}

const MINUTE = 60_000;

function parseInstant(value: string, field: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new AppError('VALIDATION_FAILED', `Invalid ${field}`, { field });
  return new Date(ms).toISOString();
}

const actorRef = (actor: Actor) => ({ actor: actor.type, actorId: actor.id });

export function createBookingServiceFromRepository(options: BookingServiceOptions): BookingService {
  const repo = options.repository;
  const logger = options.logger ?? createLogger({ module: 'booking' });
  const clock = options.clock ?? (() => new Date());

  async function requireBusiness(businessId: UUID): Promise<BusinessRow> {
    const business = await repo.getBusiness(businessId);
    if (!business) throw notFound('Business');
    return business;
  }

  async function requireService(businessId: UUID, serviceId: UUID): Promise<ServiceRow> {
    const service = await repo.getService(businessId, serviceId);
    if (!service) throw notFound('Service');
    return service;
  }

  /** Active, bookable staff qualified for the service, in sort order. */
  async function bookableStaff(businessId: UUID, serviceId: UUID): Promise<StaffRow[]> {
    const [staff, links] = await Promise.all([repo.listStaff(businessId), repo.listStaffServices(businessId)]);
    const qualified = new Set(links.filter((l) => l.service_id === serviceId).map((l) => l.staff_id));
    return staff.filter((s) => s.is_active && s.accepts_bookings && qualified.has(s.id));
  }

  /** Explains why an explicitly requested staff member cannot take the booking. */
  async function explainUnbookableStaff(businessId: UUID, staffId: UUID): Promise<never> {
    const staff = await repo.getStaff(businessId, staffId);
    if (!staff) throw notFound('Staff');
    if (!staff.is_active || !staff.accepts_bookings) {
      throw ruleViolation('STAFF_INACTIVE', 'This staff member is not taking bookings');
    }
    throw ruleViolation('STAFF_NOT_QUALIFIED', 'This staff member does not perform this service');
  }

  interface ContextArgs {
    business: BusinessRow;
    durationMinutes: number;
    staff: StaffRow[];
    from: ISODate;
    to: ISODate;
    now: Date;
    excludeAppointmentId?: UUID;
  }

  /** Loads everything the pure engine needs for dates [from, to]. */
  async function availabilityInput(args: ContextArgs): Promise<AvailabilityInput> {
    const { business, staff } = args;
    const tz = business.timezone;
    const ids = staff.map((s) => s.id);
    const windowStart = new Date(dayBoundsInZone(args.from, tz).start).toISOString();
    // One extra day covers buffers that spill past midnight.
    const windowEnd = new Date(dayBoundsInZone(addDays(args.to, 1), tz).end).toISOString();
    const [hours, rules, overrides, busy] = await Promise.all([
      repo.listBusinessHours(business.id),
      repo.listAvailabilityRules(business.id, ids),
      repo.listOverrides(business.id, args.from, args.to),
      repo.listBusy(business.id, ids, windowStart, windowEnd),
    ]);
    return {
      timezone: tz,
      rules: bookingRules(business),
      businessHours: hours.map((h) => ({ weekday: h.weekday, start: h.opens_at, end: h.closes_at })),
      overrides: overrides.map((o) => ({
        staff_id: o.staff_id,
        date: o.date,
        is_closed: o.is_closed,
        start_time: o.start_time,
        end_time: o.end_time,
      })),
      staff: staff.map((s) => ({
        id: s.id,
        sort_order: s.sort_order,
        rules: rules
          .filter((r) => r.staff_id === s.id)
          .map((r) => ({ weekday: r.weekday, start: r.start_time, end: r.end_time })),
      })),
      busy: busy
        .filter((b) => b.id !== args.excludeAppointmentId)
        .map((b) => ({ staff_id: b.staff_id, ...rangeBounds(b.blocked) })),
      durationMinutes: args.durationMinutes,
      now: args.now,
    };
  }

  /** Candidate staff for a query: all bookable staff, or just the requested one. */
  async function candidates(businessId: UUID, serviceId: UUID, staffId?: UUID | null): Promise<StaffRow[]> {
    const all = await bookableStaff(businessId, serviceId);
    return staffId ? all.filter((s) => s.id === staffId) : all;
  }

  interface ResolveArgs {
    business: BusinessRow;
    serviceId: UUID;
    durationMinutes: number;
    startsAt: string;
    requestedStaffId: UUID | null;
    preferredStaffId?: UUID;
    allowOutsideHours: boolean;
    now: Date;
    excludeAppointmentId?: UUID;
  }

  /**
   * Re-validates the requested start against live availability and resolves
   * the staff member: requested → must be free; otherwise the preferred one
   * (current staff on reschedule) if free, else the deterministic tie-break winner.
   */
  async function resolveStaff(args: ResolveArgs): Promise<UUID> {
    const staff = await bookableStaff(args.business.id, args.serviceId);
    if (args.requestedStaffId && !staff.some((s) => s.id === args.requestedStaffId)) {
      await explainUnbookableStaff(args.business.id, args.requestedStaffId);
    }
    const date = dateInZone(args.startsAt, args.business.timezone);
    const input = await availabilityInput({
      business: args.business,
      durationMinutes: args.durationMinutes,
      staff,
      from: date,
      to: date,
      now: args.now,
      excludeAppointmentId: args.excludeAppointmentId,
    });
    const free = args.allowOutsideHours
      ? freeStaffIgnoringHours(input, args.startsAt)
      : (findSlot(input, args.startsAt)?.staff_ids ?? []);

    if (args.requestedStaffId) {
      // Walk-ins: the exclusion constraint is the overlap guard.
      if (args.allowOutsideHours || free.includes(args.requestedStaffId)) return args.requestedStaffId;
      throw new AppError('SLOT_UNAVAILABLE', 'That time slot is no longer available');
    }
    if (args.preferredStaffId && free.includes(args.preferredStaffId)) return args.preferredStaffId;
    const pick = free[0];
    if (!pick) throw new AppError('SLOT_UNAVAILABLE', 'That time slot is no longer available');
    return pick;
  }

  async function notify(businessId: UUID, row: AppointmentRow, kind: AppointmentChangeKind, actor: Actor, notifyCustomer?: boolean) {
    try {
      await options.notifications.appointmentChanged({
        businessId,
        appointmentId: row.id,
        kind,
        actor,
        notifyCustomer: notifyCustomer ?? false,
      });
    } catch (error) {
      logger.error('appointment_notification_failed', { appointment_id: row.id, kind, error });
    }
  }

  /** Customers must act at least cancellation_window_minutes before the start. */
  function assertCustomerWindow(business: BusinessRow, row: AppointmentRow, actor: Actor, now: Date, enforce = false) {
    if (actor.type !== 'customer' && !enforce) return;
    const windowMinutes = bookingRules(business).cancellation_window_minutes;
    const start = Date.parse(rangeBounds(row.slot).start);
    if (start - now.getTime() < windowMinutes * MINUTE) {
      throw ruleViolation(
        'CANCELLATION_WINDOW',
        `Changes must be made at least ${windowMinutes} minutes before the appointment`,
      );
    }
  }

  /** Loads an appointment the actor may act on (customers only see their own). */
  async function requireAppointment(businessId: UUID, appointmentId: UUID, actor: Actor): Promise<AppointmentRow> {
    const row = await repo.getAppointment(businessId, appointmentId);
    if (!row || (actor.type === 'customer' && row.client_id !== actor.id)) throw notFound('Appointment');
    return row;
  }

  return {
    async getBusiness(businessId) {
      return toBusinessDTO(await requireBusiness(businessId));
    },

    async listServices(businessId, opts): Promise<ServiceDTO[]> {
      return (await repo.listServices(businessId, opts)).map(toServiceDTO);
    },

    async listBookableStaff(businessId, serviceId): Promise<StaffDTO[]> {
      return (await bookableStaff(businessId, serviceId)).map(toStaffDTO);
    },

    async listAvailableSlots(query) {
      const business = await requireBusiness(query.businessId);
      const service = await requireService(query.businessId, query.serviceId);
      const result: AvailableSlotsResponse = { date: query.date, timezone: business.timezone, slots: [] };
      if (!service.is_active) return result;
      const staff = await candidates(query.businessId, query.serviceId, query.staffId);
      if (staff.length === 0) return result;
      const input = await availabilityInput({
        business,
        durationMinutes: service.duration_minutes,
        staff,
        from: query.date,
        to: query.date,
        now: query.now ?? clock(),
      });
      return { ...result, slots: computeSlots(input, query.date) };
    },

    async listAvailableDays(query) {
      const business = await requireBusiness(query.businessId);
      const service = await requireService(query.businessId, query.serviceId);
      if (!service.is_active) return [];
      const now = query.now ?? clock();
      const bounds = bookableDateRange({ timezone: business.timezone, rules: bookingRules(business), now });
      const from = query.from < bounds.first ? bounds.first : query.from;
      const to = query.to > bounds.last ? bounds.last : query.to;
      if (from > to) return [];
      const staff = await candidates(query.businessId, query.serviceId, query.staffId);
      if (staff.length === 0) return [];
      const input = await availabilityInput({ business, durationMinutes: service.duration_minutes, staff, from, to, now });
      return engineListDays(input, from, to);
    },

    async createAppointment(input: CreateAppointmentInput) {
      const replay = await repo.findAppointmentByIdempotencyKey(input.businessId, input.idempotencyKey);
      if (replay) return toAppointmentDTO(replay);

      const now = input.now ?? clock();
      const startsAt = parseInstant(input.startsAt, 'starts_at');
      const business = await requireBusiness(input.businessId);
      const service = await requireService(input.businessId, input.serviceId);
      if (!service.is_active) throw ruleViolation('SERVICE_INACTIVE', 'This service is not currently offered');

      const staffId = await resolveStaff({
        business,
        serviceId: service.id,
        durationMinutes: service.duration_minutes,
        startsAt,
        requestedStaffId: input.staffId ?? null,
        allowOutsideHours: !!input.allowOutsideHours && input.actor.type === 'staff',
        now,
      });
      const row = await repo.createAppointment({
        businessId: input.businessId,
        clientId: input.clientId,
        staffId,
        serviceId: service.id,
        startsAt,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes ?? null,
        ...actorRef(input.actor),
      });
      await notify(input.businessId, row, 'created', input.actor, input.notifyCustomer);
      return toAppointmentDTO(row);
    },

    async rescheduleAppointment(input: RescheduleAppointmentInput) {
      const now = input.now ?? clock();
      const startsAt = parseInstant(input.startsAt, 'starts_at');
      const business = await requireBusiness(input.businessId);
      const current = await requireAppointment(input.businessId, input.appointmentId, input.actor);
      if (current.status !== 'confirmed') {
        throw ruleViolation('INVALID_STATUS', 'Only confirmed appointments can be rescheduled');
      }
      assertCustomerWindow(business, current, input.actor, now, input.enforceCancellationWindow);

      const staffId = await resolveStaff({
        business,
        serviceId: current.service_id,
        durationMinutes: current.duration_minutes,
        startsAt,
        requestedStaffId: input.staffId ?? null,
        preferredStaffId: current.staff_id,
        allowOutsideHours: !!input.allowOutsideHours && input.actor.type === 'staff',
        now,
        excludeAppointmentId: current.id,
      });
      const row = await repo.rescheduleAppointment({
        appointmentId: current.id,
        startsAt,
        staffId,
        ...actorRef(input.actor),
      });
      await notify(input.businessId, row, 'rescheduled', input.actor, input.notifyCustomer);
      return toAppointmentDTO(row);
    },

    async cancelAppointment(input: CancelAppointmentInput) {
      const now = input.now ?? clock();
      const business = await requireBusiness(input.businessId);
      const current = await requireAppointment(input.businessId, input.appointmentId, input.actor);
      assertCustomerWindow(business, current, input.actor, now, input.enforceCancellationWindow);
      const row = await repo.cancelAppointment({
        appointmentId: current.id,
        reason: input.reason ?? null,
        ...actorRef(input.actor),
      });
      await notify(input.businessId, row, 'cancelled', input.actor, input.notifyCustomer);
      return toAppointmentDTO(row);
    },

    async getAppointment(businessId, appointmentId) {
      const row = await repo.getAppointment(businessId, appointmentId);
      return row ? toAppointmentDTO(row) : null;
    },

    async listAppointments(query) {
      const rows = await repo.listAppointmentsInWindow(query.businessId, {
        fromIso: parseInstant(query.from, 'from'),
        toIso: parseInstant(query.to, 'to'),
        staffId: query.staffId,
        clientId: query.clientId,
        status: query.status,
        after: query.after,
        limit: query.limit,
      });
      return rows.map(toAppointmentDTO);
    },

    async listUpcomingForClient(businessId, clientId, now) {
      const rows = await repo.listUpcomingAppointments(businessId, clientId, (now ?? clock()).toISOString());
      return rows.map(toAppointmentDTO);
    },
  };
}
