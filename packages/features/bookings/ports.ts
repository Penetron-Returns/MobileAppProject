/** Booking ports: the contract between the booking core, its callers and the notification channel. */
import type {
  AppointmentDTO,
  AppointmentSource,
  ClientConfirmationChannel,
  AppointmentStatus,
  AvailableSlotsResponse,
  BusinessDTO,
  ActorType,
  ISODate,
  ISODateTime,
  ServiceDTO,
  StaffDTO,
  UUID,
} from '@booking/types';

export interface Actor {
  type: ActorType;
  /** Clerk user id for staff, client id for customers, null for system */
  id: string | null;
}

export interface SlotQuery {
  businessId: UUID;
  serviceId: UUID;
  /** null/undefined = any qualified staff */
  staffId?: UUID | null;
  date: ISODate;
  /** Injected clock for determinism in tests; defaults to now */
  now?: Date;
}

export interface DaysQuery {
  businessId: UUID;
  serviceId: UUID;
  staffId?: UUID | null;
  from: ISODate;
  to: ISODate;
  now?: Date;
}

export interface CreateAppointmentInput {
  businessId: UUID;
  clientId: UUID;
  serviceId: UUID;
  /** null = "No preference": deterministic pick (fewest bookings that day, then sort_order, then id) */
  staffId?: UUID | null;
  startsAt: ISODateTime;
  source: AppointmentSource;
  idempotencyKey: string;
  actor: Actor;
  notes?: string | null;
  /** Staff-only override for walk-ins: skips hours / lead-time checks, never the overlap constraint */
  allowOutsideHours?: boolean;
  /** Send the customer a WhatsApp confirmation */
  notifyCustomer?: boolean;
  now?: Date;
}

export interface RescheduleAppointmentInput {
  businessId: UUID;
  appointmentId: UUID;
  startsAt: ISODateTime;
  staffId?: UUID | null;
  actor: Actor;
  notifyCustomer?: boolean;
  /** When the customer reschedules, availability + lead time + cancellation window are enforced */
  allowOutsideHours?: boolean;
  /** Hold a non-customer actor (Nerova acting for a customer) to the cancellation window too */
  enforceCancellationWindow?: boolean;
  now?: Date;
}

export interface CancelAppointmentInput {
  businessId: UUID;
  appointmentId: UUID;
  actor: Actor;
  reason?: string | null;
  notifyCustomer?: boolean;
  /** Hold a non-customer actor (Nerova acting for a customer) to the cancellation window too */
  enforceCancellationWindow?: boolean;
  now?: Date;
}

export interface ConfirmByClientInput {
  businessId: UUID;
  appointmentId: UUID;
  confirmedAt: ISODateTime;
  via: ClientConfirmationChannel;
  actor: Actor;
  idempotencyKey?: string | null;
}

export interface AppointmentWindowQuery {
  businessId: UUID;
  /** Appointments starting in [from, to) */
  from: ISODateTime;
  to: ISODateTime;
  staffId?: UUID;
  clientId?: UUID;
  status?: AppointmentStatus;
  /** Keyset cursor: continue after this (starts_at, id) */
  after?: { startsAt: ISODateTime; id: UUID };
  limit: number;
}

export interface BookingService {
  getBusiness(businessId: UUID): Promise<BusinessDTO>;
  listServices(businessId: UUID, opts?: { activeOnly?: boolean }): Promise<ServiceDTO[]>;
  /** Active, bookable staff qualified for the service, in sort order */
  listBookableStaff(businessId: UUID, serviceId: UUID): Promise<StaffDTO[]>;
  listAvailableDays(query: DaysQuery): Promise<ISODate[]>;
  listAvailableSlots(query: SlotQuery): Promise<AvailableSlotsResponse>;
  /**
   * One entry per calendar date in [from, to], computed from a single load of the schedule data
   * (same slots as calling listAvailableSlots per date, without repeating the queries for each one).
   */
  listAvailableSlotsForRange(query: DaysQuery): Promise<AvailableSlotsResponse[]>;
  /** Validates against live availability, then writes atomically via the create_appointment RPC */
  createAppointment(input: CreateAppointmentInput): Promise<AppointmentDTO>;
  /** Customer actors are held to cancellation_window_minutes (RULE_VIOLATION rule=CANCELLATION_WINDOW) */
  rescheduleAppointment(input: RescheduleAppointmentInput): Promise<AppointmentDTO>;
  cancelAppointment(input: CancelAppointmentInput): Promise<AppointmentDTO>;
  getAppointment(businessId: UUID, appointmentId: UUID): Promise<AppointmentDTO | null>;
  /** Appointments starting in a window, ordered by (starts_at, id); `limit` rows at most */
  listAppointments(query: AppointmentWindowQuery): Promise<AppointmentDTO[]>;
  /** Confirmed appointments starting after `now`, ascending */
  listUpcomingForClient(businessId: UUID, clientId: UUID, now?: Date): Promise<AppointmentDTO[]>;
  /** confirmed → completed | no_show (staff action; the RPC rejects any other transition) */
  setAppointmentStatus(
    businessId: UUID,
    appointmentId: UUID,
    status: 'completed' | 'no_show',
    actor: Actor,
  ): Promise<AppointmentDTO>;
  /**
   * The client confirmed attendance (reminder reply). Idempotent: an already confirmed appointment, a repeated key or a
   * status other than confirmed returns the appointment unchanged. Writes the columns and a `client_confirmed` event.
   */
  confirmByClient(input: ConfirmByClientInput): Promise<AppointmentDTO>;
}

export type AppointmentChangeKind = 'created' | 'rescheduled' | 'cancelled';

export interface AppointmentChangedEvent {
  businessId: UUID;
  appointmentId: UUID;
  kind: AppointmentChangeKind;
  actor: Actor;
  /** Send the customer a WhatsApp message (session message in-window, template otherwise) */
  notifyCustomer: boolean;
}

export interface NotificationService {
  /** Must never throw for delivery failures; failures are logged + escalated. */
  appointmentChanged(event: AppointmentChangedEvent): Promise<void>;
}

export type AppointmentEventKind = 'created' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';

export interface AppointmentLifecycleEvent {
  businessId: UUID;
  kind: AppointmentEventKind;
  appointment: AppointmentDTO;
  actor: Actor;
  /** `appointment_events.id` of the row the change wrote: the basis of the idempotent outbound event id */
  eventRowId: UUID;
}

/**
 * Tells an external platform (Nerova) about a committed appointment change. Called after commit, never
 * inline with the request; must never throw. `enabled` lets the booking service skip the event lookup.
 */
export interface AppointmentEventsPort {
  readonly enabled: boolean;
  appointmentChanged(event: AppointmentLifecycleEvent): Promise<void>;
}
