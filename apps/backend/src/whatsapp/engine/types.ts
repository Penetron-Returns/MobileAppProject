import type {
  AppointmentDTO,
  BookingRules,
  EscalationReason,
  ServiceDTO,
  SlotDTO,
  StaffDTO,
} from '../../../../../packages/shared/api.ts';
import type { OutMessage } from '../messages.ts';

/** Must match the `conversations.state` check constraint (BUILD_PLAN §5). */
export const STATES = [
  'idle',
  'menu',
  'flow_booking',
  'flow_reschedule',
  'select_service',
  'select_staff',
  'select_date',
  'select_slot',
  'confirm',
  'manage_booking',
  'manage_appointment',
  'reschedule_select_date',
  'reschedule_select_slot',
  'reschedule_confirm',
  'cancel_confirm',
  'escalated',
  'closed',
] as const;

export type ConvState = (typeof STATES)[number];

export const isConvState = (v: unknown): v is ConvState => typeof v === 'string' && (STATES as readonly string[]).includes(v);

/** Persisted in `conversations.context`. Only ids and small scalars. */
export interface ConvContext {
  attemptId?: string;
  serviceId?: string;
  /** null = no preference */
  staffId?: string | null;
  /** The staff step was shown (for nav:back) */
  staffStep?: boolean;
  date?: string;
  page?: number;
  startsAt?: string;
  slotStaffId?: string | null;
  appointmentId?: string;
  /** ISO time a booking mutation was dispatched (guards double taps) */
  busySince?: string;
  /** Escalated: the one fixed ack has been sent */
  ackSent?: boolean;
  /** Blocked client: last time the fixed notice was sent */
  blockedNoticeAt?: string;
}

export interface Snapshot {
  state: ConvState;
  context: ConvContext;
  invalidInputCount: number;
}

export type BookingOp = 'create' | 'reschedule' | 'cancel';

/** Typed inputs (BUILD_PLAN §5). `booking_result` is internal: the executor feeds it back. */
export type EngineInput =
  | { kind: 'text' }
  | { kind: 'unsupported' }
  | { kind: 'button'; id: string }
  | { kind: 'list'; id: string }
  | { kind: 'template_button'; payload: string }
  | {
      kind: 'flow_completed';
      /** true when the flow token signature and conversation matched */
      valid: boolean;
      flow: 'booking' | 'reschedule';
      /** Attempt id from the token (booking flows) */
      attemptId: string | null;
      appointmentId: string | null;
      /**
       * Booking Flow `complete` payload (SUMMARY): the engine books it. Absent
       * for a reschedule Flow, which is already written when it completes.
       */
      booking?: { serviceId: string; startsAt: string } | null;
      /** The verified flow token, used in the booking idempotency key */
      flowToken?: string | null;
    }
  | { kind: 'booking_result'; op: BookingOp; ok: true; appointment: AppointmentDTO }
  | { kind: 'booking_result'; op: BookingOp; ok: false; code: 'SLOT_UNAVAILABLE' | 'CANCELLATION_WINDOW' | 'ERROR'; detail?: string };

export type Action =
  | {
      type: 'send';
      message: OutMessage;
      dedupeKey?: string;
      critical?: boolean;
      /** Booking confirmations also record a `confirmation_sent` appointment event */
      confirmation?: { appointmentId: string; kind: 'created' | 'rescheduled' | 'cancelled' };
    }
  | { type: 'escalate'; reason: EscalationReason }
  | { type: 'attempt_start'; attemptId: string }
  | { type: 'attempt_step'; attemptId: string; step: string; at: string }
  | {
      type: 'attempt_finish';
      attemptId: string;
      outcome: 'completed' | 'abandoned' | 'failed';
      appointmentId?: string;
      errorCode?: string;
    }
  | { type: 'create_booking'; serviceId: string; staffId: string | null; startsAt: string; idempotencyKey: string }
  | { type: 'reschedule_booking'; appointmentId: string; startsAt: string; staffId: string | null }
  | { type: 'cancel_booking'; appointmentId: string };

export interface Transition {
  state: ConvState;
  context: ConvContext;
  invalidInputCount: number;
  actions: Action[];
}

/**
 * Data the transition can ask for. The runner fetches it through the
 * BookingService and calls the transition again (see engine/run.ts).
 */
export type DataRequest =
  | { kind: 'services' }
  | { kind: 'staff'; serviceId: string }
  | { kind: 'days'; serviceId: string; staffId: string | null }
  | { kind: 'slots'; serviceId: string; staffId: string | null; date: string }
  | { kind: 'upcoming' }
  | { kind: 'appointment'; id: string };

export interface DataValues {
  services: ServiceDTO[];
  staff: StaffDTO[];
  days: string[];
  slots: SlotDTO[];
  upcoming: AppointmentDTO[];
  appointment: AppointmentDTO | null;
}

export type TransitionResult = Transition | { need: DataRequest };

export function dataKey(req: DataRequest): string {
  switch (req.kind) {
    case 'services':
      return 'services';
    case 'staff':
      return `staff:${req.serviceId}`;
    case 'days':
      return `days:${req.serviceId}:${req.staffId ?? 'any'}`;
    case 'slots':
      return `slots:${req.serviceId}:${req.staffId ?? 'any'}:${req.date}`;
    case 'upcoming':
      return 'upcoming';
    case 'appointment':
      return `appt:${req.id}`;
  }
}

export interface EngineBusiness {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  rules: BookingRules;
}

export interface EngineCtx {
  now: Date;
  business: EngineBusiness;
  conversationId: string;
  clientId: string;
  clientBlocked: boolean;
  /** Flow available = flow id configured and account live */
  flows: { booking: boolean; reschedule: boolean };
  /** `wa:<wamid>` of the inbound message being processed */
  inboundKey: string;
  /** Pre-generated id used if this transition starts a booking attempt */
  newAttemptId: string;
  /** Pre-fetched data keyed by dataKey() */
  data: Record<string, unknown>;
}
