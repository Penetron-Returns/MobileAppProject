/**
 * BookingService (src/ports.ts) over a BookingRepository.
 * Availability is always computed live from the repository; writes go
 * through the SQL RPCs, which remain the final guard (exclusion constraint).
 */
import type { AvailableSlotsResponse, ISODate, ServiceDTO, StaffDTO, UUID } from '@booking/types';
import { AppError, notFound, ruleViolation } from '../../lib/errors.ts';
import { createLogger, type Logger } from '../../lib/logger.ts';
import { dateInZone, dateRange, rangeBounds } from '../../lib/time.ts';
import type {
  Actor,
  AppointmentChangeKind,
  AppointmentEventsPort,
  BookingMeter,
  BookingService,
  CancelAppointmentInput,
  CreateAppointmentInput,
  NotificationService,
  RescheduleAppointmentInput,
} from '../../ports.ts';
import {
  bookableDateRange,
  computeSlots,
  findSlot,
  freeStaffIgnoringHours,
  listAvailableDays as engineListDays,
} from '../../availability/lib/availability.ts';
import { computeFreeTime } from '../../availability/lib/freeTime.ts';
import { createAppointmentEventPublisher } from '../lib/appointmentEvents.ts';
import { loadAvailabilityInput, type AvailabilityContextArgs } from '../lib/availabilityInput.ts';
import { bookingRules, toAppointmentDTO, toBusinessDTO, toServiceDTO, toStaffDTO } from '../lib/mappers.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import type { AppointmentRow, BusinessRow, ServiceRow, StaffRow } from '../../repositories/rows.ts';

export interface BookingServiceOptions {
  repository: BookingRepository;
  notifications: NotificationService;
  logger?: Logger;
  /** Default clock when a call does not pass `now` */
  clock?: () => Date;
  /** Outbound lifecycle events (Nerova), published after commit through `defer`. Omitted or disabled = nothing sent. */
  appointmentEvents?: AppointmentEventsPort;
  /**
   * Billing meter: every created booking is one usage event, sent after the booking committed (through `defer`).
   * It never throws, so a Stripe outage cannot affect a booking; a cron sweep re-sends what failed.
   */
  meter?: BookingMeter;
  /**
   * Runs a Nerova-originated change notification, and every outbound appointment event, after the response
   * instead of before it (edge: waitUntil). Other actors' notifications stay inline. Omitted = inline (tests, scripts).
   */
  defer?: (task: () => Promise<unknown>) => void;
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
  const publishEvent = createAppointmentEventPublisher({
    repository: repo,
    events: options.appointmentEvents,
    logger,
    defer: options.defer,
  });

  /** A reschedule updates the same row, so only creation is metered. A replayed create returns earlier and is not re-metered. */
  async function meterBooking(row: AppointmentRow): Promise<void> {
    const meter = options.meter;
    if (!meter) return;
    const send = () => meter.bookingCreated({ appointmentId: row.id, businessId: row.business_id, createdAt: row.created_at });
    if (options.defer) options.defer(send);
    else await send();
  }

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

  const availabilityInput = (args: AvailabilityContextArgs) => loadAvailabilityInput(repo, args);

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
    const send = async () => {
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
    };
    if (options.defer && actor.type === 'nerova') options.defer(send);
    else await send();
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
      const [business, service] = await Promise.all([
        requireBusiness(query.businessId),
        requireService(query.businessId, query.serviceId),
      ]);
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

    async listAvailableSlotsForRange(query) {
      const [business, service] = await Promise.all([
        requireBusiness(query.businessId),
        requireService(query.businessId, query.serviceId),
      ]);
      const dates = dateRange(query.from, query.to);
      const empty = (date: ISODate): AvailableSlotsResponse => ({ date, timezone: business.timezone, slots: [] });
      if (!service.is_active || dates.length === 0) return dates.map(empty);
      const staff = await candidates(query.businessId, query.serviceId, query.staffId);
      if (staff.length === 0) return dates.map(empty);
      const input = await availabilityInput({
        business,
        durationMinutes: service.duration_minutes,
        staff,
        from: query.from,
        to: query.to,
        now: query.now ?? clock(),
      });
      return dates.map((date) => ({ ...empty(date), slots: computeSlots(input, date) }));
    },

    async listFreeTime(query) {
      const business = await requireBusiness(query.businessId);
      const all = (await repo.listStaff(query.businessId)).filter((s) => s.is_active && s.accepts_bookings);
      const staff = query.staffId ? all.filter((s) => s.id === query.staffId) : all;
      if (staff.length === 0) return [];
      const tz = business.timezone;
      const input = await availabilityInput({
        business,
        durationMinutes: 0,
        staff,
        from: dateInZone(new Date(query.start), tz),
        to: dateInZone(new Date(Date.parse(query.end) - 1), tz),
        now: clock(),
      });
      return computeFreeTime(input, query);
    },

    async listAvailableDays(query) {
      const [business, service] = await Promise.all([
        requireBusiness(query.businessId),
        requireService(query.businessId, query.serviceId),
      ]);
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
      const [business, service] = await Promise.all([
        requireBusiness(input.businessId),
        requireService(input.businessId, input.serviceId),
      ]);
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
      const held = !!input.notifyCustomer && !!input.holdClientNotificationUntil;
      if (held) await repo.holdClientNotification(input.businessId, row.id, parseInstant(input.holdClientNotificationUntil ?? '', 'holdClientNotificationUntil'));
      await notify(input.businessId, row, 'created', input.actor, held ? false : input.notifyCustomer);
      await publishEvent(row, 'created', input.actor);
      await meterBooking(row);
      return toAppointmentDTO(row);
    },

    async rescheduleAppointment(input: RescheduleAppointmentInput) {
      const now = input.now ?? clock();
      const startsAt = parseInstant(input.startsAt, 'starts_at');
      const [business, current] = await Promise.all([
        requireBusiness(input.businessId),
        requireAppointment(input.businessId, input.appointmentId, input.actor),
      ]);
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
      await notify(input.businessId, row, 'rescheduled', input.actor, input.notifyCustomer && !current.client_notify_after);
      await publishEvent(row, 'rescheduled', input.actor);
      return toAppointmentDTO(row);
    },

    async cancelAppointment(input: CancelAppointmentInput) {
      const now = input.now ?? clock();
      const [business, current] = await Promise.all([
        requireBusiness(input.businessId),
        requireAppointment(input.businessId, input.appointmentId, input.actor),
      ]);
      assertCustomerWindow(business, current, input.actor, now, input.enforceCancellationWindow);
      if (input.voided) {
        // Undo: nothing for the client, no outbound `cancelled` event (Nerova made the undo itself).
        const voidedRow = await repo.voidAppointment({ appointmentId: current.id, ...actorRef(input.actor) });
        await notify(input.businessId, voidedRow, 'cancelled', input.actor, false);
        return toAppointmentDTO(voidedRow);
      }
      const row = await repo.cancelAppointment({
        appointmentId: current.id,
        reason: input.reason ?? null,
        ...actorRef(input.actor),
      });
      // A still-held booking was never announced to the client, so its cancellation is not either.
      await notify(input.businessId, row, 'cancelled', input.actor, input.notifyCustomer && !current.client_notify_after);
      await publishEvent(row, 'cancelled', input.actor);
      return toAppointmentDTO(row);
    },

    async setAppointmentStatus(businessId, appointmentId, status, actor) {
      await requireAppointment(businessId, appointmentId, actor);
      const row = await repo.setAppointmentStatus({ appointmentId, status, ...actorRef(actor) });
      await publishEvent(row, status, actor);
      return toAppointmentDTO(row);
    },

    async confirmByClient(input) {
      const current = await requireAppointment(input.businessId, input.appointmentId, input.actor);
      if (current.status !== 'confirmed' || current.client_confirmed_at) return toAppointmentDTO(current);
      const row = await repo.confirmAppointmentByClient({
        businessId: input.businessId,
        appointmentId: input.appointmentId,
        confirmedAt: parseInstant(input.confirmedAt, 'confirmedAt'),
        via: input.via,
        idempotencyKey: input.idempotencyKey ?? null,
        ...actorRef(input.actor),
      });
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
