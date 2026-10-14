/**
 * API contract shared by the Expo app and the backend.
 * TYPES ONLY — this file must never import runtime code, so both sides
 * can depend on it without sharing node_modules.
 * See docs/BUILD_PLAN.md §4.
 */

// ---------- primitives ----------
/** ISO-8601 instant with offset, e.g. 2026-09-30T09:00:00.000Z */
export type ISODateTime = string;
/** Calendar date in the business timezone, YYYY-MM-DD */
export type ISODate = string;
/** Wall-clock time HH:mm (24h) in the business timezone */
export type TimeOfDay = string;
export type UUID = string;

export type MemberRole = 'owner' | 'staff';
export type AppointmentStatus =
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';
export type AppointmentSource = 'whatsapp' | 'app' | 'web';
export type ActorType = 'customer' | 'staff' | 'system';

// ---------- plans / entitlements ----------
/** Internal plan ids (display names and prices are not part of the contract). */
export type PlanKey = 'free' | 'starter' | 'growth' | 'pro';
/** Entitlement keys. Code gates on these, never on a plan name. */
export type FeatureKey =
  | 'whatsapp_menu'
  | 'inbox'
  | 'companion'
  | 'desktop_app'
  | 'extensions'
  | 'assistant_bookings';
export interface FeatureEntitlementDTO {
  feature: FeatureKey;
  /** Monthly cap; null = unlimited / not capped */
  monthly_limit: number | null;
}
export interface EntitlementsDTO {
  plan: PlanKey;
  features: FeatureEntitlementDTO[];
}
export type WhatsAppAccountStatus =
  | 'pending'
  | 'live'
  | 'needs_reauth'
  | 'disconnected'
  | 'paused';
export type TemplateStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paused'
  | 'disabled';
export type EscalationReason =
  | 'customer_requested'
  | 'unrecognised_input'
  | 'unlinked_number'
  | 'delivery_failed'
  | 'flow_error'
  | 'cancellation_window';

// ---------- envelopes ----------
export interface ApiSuccess<T> {
  data: T;
}

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NO_BUSINESS'
  | 'NOT_FOUND'
  | 'SLOT_UNAVAILABLE'
  | 'WINDOW_CLOSED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'RULE_VIOLATION'
  | 'FEATURE_NOT_IN_PLAN'
  | 'RATE_LIMITED'
  | 'UPSTREAM_META_ERROR'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    request_id: string;
  };
}

// ---------- business ----------
export interface BookingRules {
  lead_time_minutes: number;
  cancellation_window_minutes: number;
  buffer_minutes: number;
  slot_interval_minutes: number;
  booking_horizon_days: number;
  reminder_offsets_minutes: number[];
  allow_staff_selection: boolean;
}

export interface BusinessDTO {
  id: UUID;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  booking_rules: BookingRules;
}

export interface UpdateBusinessRequest {
  name?: string;
  slug?: string;
  timezone?: string;
  currency?: string;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  booking_rules?: Partial<BookingRules>;
}

export interface BusinessHoursRow {
  weekday: number; // 0 = Sunday
  opens_at: TimeOfDay;
  closes_at: TimeOfDay;
}

export interface ReplaceBusinessHoursRequest {
  hours: BusinessHoursRow[];
}

export interface MeDTO {
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  business: BusinessDTO;
  role: MemberRole;
  /** The business's plan and the features it unlocks (see EntitlementsDTO) */
  plan: PlanKey;
  features: FeatureEntitlementDTO[];
}

// ---------- services & staff ----------
export interface ServiceDTO {
  id: UUID;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number;
  is_active: boolean;
  sort_order: number;
}

export type CreateServiceRequest = Omit<ServiceDTO, 'id' | 'is_active'> & {
  is_active?: boolean;
  staff_ids?: UUID[];
};
export type UpdateServiceRequest = Partial<CreateServiceRequest>;

export interface StaffDTO {
  id: UUID;
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

export type CreateStaffRequest = Omit<
  StaffDTO,
  'id' | 'is_active' | 'accepts_bookings' | 'sort_order'
> & {
  is_active?: boolean;
  accepts_bookings?: boolean;
  sort_order?: number;
  service_ids?: UUID[];
};
export type UpdateStaffRequest = Partial<CreateStaffRequest>;

export interface AvailabilityRuleInput {
  weekday: number;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
}

export interface CreateOverrideRequest {
  staff_id?: UUID | null;
  date: ISODate;
  is_closed: boolean;
  start_time?: TimeOfDay | null;
  end_time?: TimeOfDay | null;
  reason?: string | null;
}

// ---------- clients ----------
export interface ClientDTO {
  id: UUID;
  phone_e164: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  is_blocked: boolean;
  whatsapp_opt_in: boolean;
  first_seen_at: ISODateTime;
  last_seen_at: ISODateTime | null;
}

export interface CreateClientRequest {
  phone: string; // any format; normalised to E.164 server-side
  name?: string | null;
  email?: string | null;
  notes?: string | null;
  tags?: string[];
}
export type UpdateClientRequest = Partial<CreateClientRequest> & {
  is_blocked?: boolean;
  whatsapp_opt_in?: boolean;
};

export interface ClientNoteDTO {
  id: UUID;
  client_id: UUID;
  body: string;
  kind: 'general' | 'warning' | 'preference';
  created_by: string | null;
  created_at: ISODateTime;
}

export interface CreateClientNoteRequest {
  body: string;
  kind?: ClientNoteDTO['kind'];
}

// ---------- availability ----------
export interface SlotDTO {
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  /** Qualified staff free for this slot, ordered by the deterministic tie-break. */
  staff_ids: UUID[];
}

export interface AvailableDaysResponse {
  days: ISODate[];
}
export interface AvailableSlotsResponse {
  date: ISODate;
  timezone: string;
  slots: SlotDTO[];
}

// ---------- appointments ----------
export interface AppointmentDTO {
  id: UUID;
  business_id: UUID;
  client_id: UUID;
  staff_id: UUID;
  service_id: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  status: AppointmentStatus;
  source: AppointmentSource;
  price_cents: number;
  duration_minutes: number;
  notes: string | null;
  checked_in_at: ISODateTime | null;
  cancelled_at: ISODateTime | null;
  cancel_reason: string | null;
  created_at: ISODateTime;
}

export interface CreateAppointmentRequest {
  client_id?: UUID;
  new_client?: CreateClientRequest;
  service_id: UUID;
  /** null/omitted = "No preference" → deterministic staff pick */
  staff_id?: UUID | null;
  starts_at: ISODateTime;
  notes?: string | null;
  send_whatsapp_confirmation?: boolean;
  /** staff-only: permit walk-ins outside hours / lead time (overlap still enforced) */
  allow_outside_hours?: boolean;
}

export interface RescheduleAppointmentRequest {
  starts_at: ISODateTime;
  staff_id?: UUID | null;
  notify_customer?: boolean;
}

export interface CancelAppointmentRequest {
  reason?: string | null;
  notify_customer?: boolean;
}

export interface SetAppointmentStatusRequest {
  status: 'completed' | 'no_show';
}

export interface UpdateAppointmentRequest {
  notes: string | null;
}

// ---------- dashboard (RPC dashboard_summary) ----------
export interface DashboardSummary {
  month_revenue_cents: number;
  revenue_by_day: { date: ISODate; cents: number }[];
  today: {
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show: number;
    checked_in: number;
  };
  next_appointment_id: UUID | null;
}

// ---------- public web booking (comparator) ----------
export interface PublicBusinessResponse {
  business: Pick<
    BusinessDTO,
    'id' | 'name' | 'slug' | 'timezone' | 'currency' | 'logo_url' | 'address'
  > & { allow_staff_selection: boolean };
  services: ServiceDTO[];
  staff: Pick<StaffDTO, 'id' | 'name' | 'title' | 'photo_url'>[];
  /** service_id → staff ids qualified to perform it */
  staff_services: Record<UUID, UUID[]>;
}

export interface StartAttemptResponse {
  attempt_id: UUID;
}

export interface RecordAttemptStepRequest {
  step: string;
}

export interface PublicBookingRequest {
  attempt_id?: UUID;
  service_id: UUID;
  staff_id?: UUID | null;
  starts_at: ISODateTime;
  name: string;
  phone: string;
  email?: string | null;
}

export interface PublicBookingResponse {
  appointment: Pick<
    AppointmentDTO,
    'id' | 'starts_at' | 'ends_at' | 'status' | 'service_id' | 'staff_id'
  >;
}

// ---------- WhatsApp ----------
export interface WhatsAppTemplateDTO {
  id: UUID;
  name: string;
  language: string;
  category: string | null;
  status: TemplateStatus;
  rejection_reason: string | null;
}

export interface WhatsAppChannelDTO {
  connected: boolean;
  status: WhatsAppAccountStatus | null;
  display_phone: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  messaging_limit: string | null;
  token_expires_at: ISODateTime | null;
  last_health_check_at: ISODateTime | null;
  last_error: string | null;
  flows: { booking: string | null; reschedule: string | null };
  templates: WhatsAppTemplateDTO[];
}

export interface EmbeddedSignupRequest {
  code: string;
  waba_id: string;
  phone_number_id: string;
}

export interface ManualConnectRequest {
  waba_id: string;
  phone_number_id: string;
  access_token: string;
}

export interface TestMessageRequest {
  to: string;
}

export interface SendStaffMessageRequest {
  text: string;
}

export interface ResolveEscalationRequest {
  note?: string | null;
}

export interface RegisterDeviceRequest {
  token: string;
  platform: 'ios' | 'android' | 'web';
}
