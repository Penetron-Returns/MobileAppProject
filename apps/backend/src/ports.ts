/**
 * Contracts between backend modules. WS-B implements BookingService,
 * WS-C implements NotificationService and consumes BookingService.
 * Changing a signature here means updating both sides in the same PR.
 */
import type {
  ActorType,
  AppointmentDTO,
  AppointmentSource,
  AvailableSlotsResponse,
  BusinessDTO,
  EntitlementsDTO,
  FeatureKey,
  ISODate,
  ISODateTime,
  ServiceDTO,
  StaffDTO,
  UUID,
} from '../../../packages/shared/api.ts';

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
  now?: Date;
}

export interface CancelAppointmentInput {
  businessId: UUID;
  appointmentId: UUID;
  actor: Actor;
  reason?: string | null;
  notifyCustomer?: boolean;
  now?: Date;
}

export interface BookingService {
  getBusiness(businessId: UUID): Promise<BusinessDTO>;
  listServices(businessId: UUID, opts?: { activeOnly?: boolean }): Promise<ServiceDTO[]>;
  /** Active, bookable staff qualified for the service, in sort order */
  listBookableStaff(businessId: UUID, serviceId: UUID): Promise<StaffDTO[]>;
  listAvailableDays(query: DaysQuery): Promise<ISODate[]>;
  listAvailableSlots(query: SlotQuery): Promise<AvailableSlotsResponse>;
  /** Validates against live availability, then writes atomically via the create_appointment RPC */
  createAppointment(input: CreateAppointmentInput): Promise<AppointmentDTO>;
  /** Customer actors are held to cancellation_window_minutes (RULE_VIOLATION rule=CANCELLATION_WINDOW) */
  rescheduleAppointment(input: RescheduleAppointmentInput): Promise<AppointmentDTO>;
  cancelAppointment(input: CancelAppointmentInput): Promise<AppointmentDTO>;
  getAppointment(businessId: UUID, appointmentId: UUID): Promise<AppointmentDTO | null>;
  /** Confirmed appointments starting after `now`, ascending */
  listUpcomingForClient(businessId: UUID, clientId: UUID, now?: Date): Promise<AppointmentDTO[]>;
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

/** Resolves what a business's plan unlocks. Always a live read: plans can change at any time. */
export interface EntitlementService {
  getEntitlements(businessId: UUID): Promise<EntitlementsDTO>;
  hasFeature(businessId: UUID, feature: FeatureKey): Promise<boolean>;
}
