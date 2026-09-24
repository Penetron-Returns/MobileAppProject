/**
 * Explicit row shapes for the tables the booking core touches
 * (docs/BUILD_PLAN.md §3). `shared/database.types.ts` is still a loose
 * placeholder, so the repository casts PostgREST results to these.
 */
import type {
  ActorType,
  AppointmentSource,
  AppointmentStatus,
  BookingRules,
  MemberRole,
  UUID,
} from '../../../shared/api.ts';

export const DEFAULT_BOOKING_RULES: BookingRules = {
  lead_time_minutes: 60,
  cancellation_window_minutes: 1440,
  buffer_minutes: 0,
  slot_interval_minutes: 15,
  booking_horizon_days: 60,
  reminder_offsets_minutes: [1440, 120],
  allow_staff_selection: true,
};

export interface BusinessRow {
  id: UUID;
  clerk_org_id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  booking_rules: Partial<BookingRules> | null;
}

export interface UserRow {
  id: string;
  business_id: UUID | null;
  role: MemberRole;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface StaffRow {
  id: UUID;
  business_id: UUID;
  user_id: string | null;
  name: string;
  title: string | null;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  color: string | null;
  is_active: boolean;
  accepts_bookings: boolean;
  sort_order: number;
}

export interface ServiceRow {
  id: UUID;
  business_id: UUID;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number;
  is_active: boolean;
  sort_order: number;
}

export interface StaffServiceRow {
  business_id: UUID;
  staff_id: UUID;
  service_id: UUID;
}

export interface BusinessHoursDbRow {
  business_id: UUID;
  weekday: number;
  /** Postgres `time`, e.g. `09:00:00` */
  opens_at: string;
  closes_at: string;
}

export interface AvailabilityRuleRow {
  business_id: UUID;
  staff_id: UUID;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface OverrideRow {
  id: UUID;
  business_id: UUID;
  staff_id: UUID | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_closed: boolean;
  reason: string | null;
}

export interface ClientRow {
  id: UUID;
  business_id: UUID;
  phone_e164: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  is_blocked: boolean;
  whatsapp_opt_in: boolean;
  first_seen_at: string;
  last_seen_at: string | null;
}

export type ClientNoteKind = 'general' | 'warning' | 'preference';

export interface ClientNoteRow {
  id: UUID;
  business_id: UUID;
  client_id: UUID;
  body: string;
  kind: ClientNoteKind;
  created_by: string | null;
  created_at: string;
}

export interface AppointmentRow {
  id: UUID;
  business_id: UUID;
  client_id: UUID;
  staff_id: UUID;
  service_id: UUID;
  /** tstzrange text */
  slot: string;
  blocked: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  price_cents: number;
  duration_minutes: number;
  notes: string | null;
  idempotency_key: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export type AttemptOutcome = 'in_progress' | 'completed' | 'abandoned' | 'failed';
export type BookingChannel = 'whatsapp' | 'web' | 'app';

export interface AttemptStep {
  step: string;
  at: string;
}

export interface BookingAttemptRow {
  id: UUID;
  business_id: UUID;
  channel: BookingChannel;
  client_id: UUID | null;
  conversation_id: UUID | null;
  session_key: string | null;
  started_at: string;
  completed_at: string | null;
  step_count: number;
  outcome: AttemptOutcome;
  appointment_id: UUID | null;
  error_code: string | null;
  steps: AttemptStep[];
}

export interface WebhookEventRow {
  id: UUID;
  source: string;
  event_key: string;
  payload: unknown;
  received_at: string;
  processed_at: string | null;
  error: string | null;
  attempts: number;
}

export interface ActorRef {
  actor: ActorType;
  actorId: string | null;
}
