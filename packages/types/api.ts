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
  'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type AppointmentSource = 'whatsapp' | 'app' | 'web' | 'nerova';
/** Where a client confirmed an appointment (reminder button, link, ...) */
export type ClientConfirmationChannel = 'whatsapp' | 'sms' | 'web' | 'app';
export type ActorType = 'customer' | 'staff' | 'system' | 'nerova';

// ---------- plans / entitlements ----------
/** Internal plan ids (display names and prices are not part of the contract). */
/** 'none' = no active plan yet (new businesses; entitled to nothing, the app shows only the plan chooser). 'free' survives for existing rows only. */
export type PlanKey = 'none' | 'free' | 'starter' | 'growth' | 'pro';
/** Entitlement keys. Code gates on these, never on a plan name. */
export type FeatureKey =
  | 'whatsapp_menu'
  | 'inbox'
  | 'companion'
  | 'desktop_app'
  | 'extensions'
  | 'assistant_bookings'
  | 'reports';
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
  'pending' | 'live' | 'needs_reauth' | 'disconnected' | 'paused';
export type TemplateStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'paused' | 'disabled';
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
  | 'COMPANION_NOT_READY'
  | 'WHATSAPP_ALREADY_CONNECTED'
  | 'UPSTREAM_COMPANION_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'TRANSCRIPTION_UNAVAILABLE'
  | 'BILLING_NOT_CONFIGURED'
  | 'UPSTREAM_BILLING_ERROR'
  | 'PAYMENT_FAILED'
  | 'INTERNAL';

/** POST /v1/voice/transcriptions response data (multipart request: field `audio`, optional `language`) */
export interface TranscriptionDTO {
  text: string;
  duration_ms: number;
  /** Detected (or requested) language code; null when Nerova does not say */
  language: string | null;
}

/** POST /v1/voice/device-token response data: shown once, only its hash is stored */
export interface DeviceTokenDTO {
  /** `cvt_` + 32 random bytes (base64url). Usable only on the voice upload and the attendance answer */
  token: string;
}

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

/** Who answers "did the client come?": each staff member for their own appointments, or the owner for everyone. */
export type AttendanceMode = 'staff' | 'owner';

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
  attendance_mode: AttendanceMode;
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
  /** Owner only; audited */
  attendance_mode?: AttendanceMode;
}

export interface BusinessHoursRow {
  weekday: number; // 0 = Sunday
  opens_at: TimeOfDay;
  closes_at: TimeOfDay;
}

/** PUT /v1/business/hours: at most ONE row per weekday (a lunch gap is a staff break). */
export interface ReplaceBusinessHoursRequest {
  hours: BusinessHoursRow[];
}

/**
 * POST /v1/onboarding (owner of the active Clerk org, no business needed yet).
 * Creates or completes the business, owner user and owner staff row, then
 * applies hours, services and team. Responds with the same shape as GET /v1/me.
 */
export interface OnboardingRequest {
  business: { name: string };
  /** Shown on the owner's own staff row (falls back to the mirrored user name) */
  owner_name?: string | null;
  /** Opening hours, one row per open range. At least one row */
  hours: BusinessHoursRow[];
  /** First services; every bookable staff member is qualified for them */
  services: { name: string; duration_minutes: number; price_cents: number }[];
  /** Extra team members besides the owner (may be empty) */
  team: { name: string; title?: string | null }[];
  /**
   * Re-run for a business that already finished onboarding (the owner went back
   * from the plan screen). Honoured only while it is untouched (plan none/free,
   * no appointments): then the name, hours and services follow this request.
   * Otherwise the existing setup is returned unchanged. `team` is ignored.
   */
  revise?: boolean;
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

/** POST /v1/overrides. `staff_id` is required now: business-wide days moved to special days. */
export interface CreateOverrideRequest {
  staff_id?: UUID | null;
  date: ISODate;
  is_closed: boolean;
  start_time?: TimeOfDay | null;
  end_time?: TimeOfDay | null;
  reason?: string | null;
}

// ---------- team (Clerk organisation members) ----------
/** A login in the business's Clerk organisation. `staff_id` = the calendar person it is linked to. */
export interface TeamMemberDTO {
  user_id: string;
  name: string | null;
  email: string | null;
  role: MemberRole;
  staff_id: UUID | null;
  is_self: boolean;
}

/** A pending Clerk organisation invitation. */
export interface TeamInvitationDTO {
  id: string;
  email: string;
  role: MemberRole;
  /** Staff row the invited login will be linked to when it joins */
  staff_id: UUID | null;
  created_at: ISODateTime;
}

export interface TeamDTO {
  members: TeamMemberDTO[];
  invitations: TeamInvitationDTO[];
}

export interface CreateInvitationRequest {
  email: string;
  role: MemberRole;
  staff_id?: UUID | null;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}

// ---------- account deletion (Google Play / App Store requirement) ----------
/** What deleting the caller's account would do: `business_deleted` when they are the only owner. */
export interface AccountDeletionPreviewDTO {
  business_deleted: boolean;
  business_name: string;
  /** Other logins in the organisation (they lose access when the business is deleted) */
  other_member_count: number;
}

/** `confirm_business_name` is required (exact name, case-insensitive) when `business_deleted` is true. */
export interface DeleteAccountRequest {
  confirm_business_name?: string;
}

export interface DeleteAccountResultDTO {
  deleted: true;
  business_deleted: boolean;
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

// ---------- hours, special days, breaks, time off ----------
// Rule order (docs/booking-core.md): business hours → special days → staff hours →
// breaks → time off → appointments, buffer, lead time, horizon.

/** A per-staff day override (`POST /v1/overrides`). Business-wide days are special days instead. */
export interface StaffDayOverrideDTO {
  id: UUID;
  staff_id: UUID;
  date: ISODate;
  is_closed: boolean;
  start_time: TimeOfDay | null;
  end_time: TimeOfDay | null;
  reason: string | null;
}

export type SpecialDayKind = 'public_holiday' | 'closure' | 'special_hours';

/** One business-wide date that is closed or has replacement hours (one range). */
export interface SpecialDayDTO {
  id: UUID;
  date: ISODate;
  name: string;
  kind: SpecialDayKind;
  is_closed: boolean;
  /** Both null when closed, both set (start < end) otherwise */
  start_time: TimeOfDay | null;
  end_time: TimeOfDay | null;
}

/**
 * POST /v1/special-days. `is_closed` defaults to true for `closure` and `public_holiday`
 * and to false for `special_hours`; a `closure` must be closed and `special_hours` open.
 */
export interface CreateSpecialDayRequest {
  date: ISODate;
  name: string;
  kind: SpecialDayKind;
  is_closed?: boolean;
  start_time?: TimeOfDay | null;
  end_time?: TimeOfDay | null;
}
/** PATCH /v1/special-days/:id. The merged result is validated like a create. */
export type UpdateSpecialDayRequest = Partial<CreateSpecialDayRequest>;

/** One South African public holiday for GET /v1/special-days/suggestions. */
export interface SpecialDaySuggestionDTO {
  date: ISODate;
  name: string;
  kind: 'public_holiday';
  is_closed: true;
  /** A Sunday holiday observed on the Monday (Public Holidays Act 36 of 1994, s 2(1)) */
  observed_for: ISODate | null;
  /** A special day already exists on that date */
  added: boolean;
  special_day_id: UUID | null;
}
export interface SpecialDaySuggestionsResponse {
  year: number;
  suggestions: SpecialDaySuggestionDTO[];
}

/** A named recurring break. `weekdays` empty = every day the staff member works (0 = Sunday). */
export interface StaffBreakDTO {
  id: UUID;
  staff_id: UUID;
  label: string;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
  weekdays: number[];
}
export interface StaffBreakInput {
  /** Defaults to "Break" */
  label?: string;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
  weekdays?: number[];
}
/** PUT /v1/staff/:id/breaks (atomic replace; `[]` removes every break). Overlapping breaks are rejected. */
export interface ReplaceStaffBreaksRequest {
  breaks: StaffBreakInput[];
}
export interface ReplaceStaffBreaksResponse {
  staff_id: UUID;
  breaks: StaffBreakDTO[];
}

export type TimeOffReason = 'leave' | 'sick' | 'training' | 'other';

/**
 * A staff absence over `starts_on`..`ends_on` (inclusive, business timezone). Both times null =
 * all day on every date of the range. Both set = those hours on EACH date of the range.
 */
export interface StaffTimeOffDTO {
  id: UUID;
  staff_id: UUID;
  starts_on: ISODate;
  ends_on: ISODate;
  start_time: TimeOfDay | null;
  end_time: TimeOfDay | null;
  reason: TimeOffReason;
  note: string | null;
}
/** POST /v1/staff/:id/time-off */
export interface CreateStaffTimeOffRequest {
  starts_on: ISODate;
  ends_on?: ISODate;
  start_time?: TimeOfDay | null;
  end_time?: TimeOfDay | null;
  reason?: TimeOffReason;
  note?: string | null;
}
/** PATCH /v1/time-off/:id. The merged result is validated like a create. */
export type UpdateStaffTimeOffRequest = Partial<CreateStaffTimeOffRequest>;

/** One staff member's schedule inside GET /v1/availability/config. */
export interface StaffAvailabilityConfigDTO {
  staff_id: UUID;
  /** One range per weekday; empty = inherits the business hours */
  rules: AvailabilityRuleInput[];
  breaks: StaffBreakDTO[];
  /** Time off overlapping [from, to] */
  time_off: StaffTimeOffDTO[];
  /** Per-staff day overrides in [from, to] */
  overrides: StaffDayOverrideDTO[];
}

/** GET /v1/availability/config?from&to: everything the hours screens render, in one call. */
export interface AvailabilityConfigResponse {
  from: ISODate;
  to: ISODate;
  timezone: string;
  business_hours: BusinessHoursRow[];
  /** Special days in [from, to] */
  special_days: SpecialDayDTO[];
  staff: StaffAvailabilityConfigDTO[];
}

/**
 * GET /v1/availability/conflicts: confirmed appointments a proposed special day or time off
 * would overlap. Never cancels anything. `mode=closed` (default): the window (whole days, or
 * start_time..end_time on each date) becomes unavailable. `mode=open_only`: only the window stays
 * available, so appointments outside it conflict (special hours).
 */
export interface AvailabilityConflictsResponse {
  conflicts: AppointmentDTO[];
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
  /** When the client confirmed attendance (reminder reply); null = not confirmed */
  client_confirmed_at: ISODateTime | null;
  client_confirmed_via: ClientConfirmationChannel | null;
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

// ---------- attendance check ----------
/** What the answerer reports. The server never sets no_show on its own. */
export type AttendanceOutcome = 'came' | 'no_show';
export type AttendanceStatus = 'pending' | 'answered';

/**
 * One "did the client make it?" question. Pending questions never expire.
 * `outcome` is resolved_elsewhere when the appointment left `confirmed` by another route before an answer.
 */
export interface AttendanceCheckDTO {
  id: UUID;
  appointment_id: UUID;
  status: AttendanceStatus;
  outcome: AttendanceOutcome | 'resolved_elsewhere' | null;
  /** 'staff' = addressed to the appointment's staff member, 'owner' = to the owner(s) */
  audience: 'staff' | 'owner';
  /** True once the question was also sent to the owner(s) (60 min without an answer, or nobody reachable) */
  escalated: boolean;
  created_at: ISODateTime;
  answered_at: ISODateTime | null;
  /** Appointment details for the list row (client first name only) */
  client_first_name: string;
  service_name: string;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
}

/** POST /v1/attendance/:checkId/answer (member: the recipient or an owner; Idempotency-Key required) */
export interface AnswerAttendanceRequest {
  outcome: AttendanceOutcome;
}

/** GET /v1/attendance/pending (member): the caller's open questions, oldest first */
export interface AttendancePendingResponse {
  count: number;
  checks: AttendanceCheckDTO[];
}

/**
 * Expo push `data` for the attendance check (all values are strings). Notification category
 * `attendance_check` carries the [She came] [No-show] actions.
 */
export type AttendancePushData =
  | { type: 'attendance_check'; checkId: UUID; appointmentId: UUID }
  | { type: 'attendance_batch'; count: string }
  | { type: 'attendance_summary'; count: string };

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

export interface UnregisterDeviceRequest {
  token: string;
}

// ---------- plans, usage, companion, reports ----------
/** Month key in the business timezone, `YYYY-MM` */
export type MonthKey = string;

/** `normal` below 80% of the included jobs, `near` from 80% up to and including 100%, `over` beyond it. Never a cut-off. */
export type UsageState = 'normal' | 'near' | 'over';

/** GET /v1/billing/usage?month=YYYY-MM (member). Free plans have no allowance: included_jobs/usage_percent are null. */
export interface BillingUsageDTO {
  plan: PlanKey;
  month: MonthKey;
  /** Deprecated alias of `bookings` (kept so older app builds keep working) */
  completed_jobs: number;
  /** Every booking CREATED in the period, whatever its source or outcome (completed, no-show, cancelled). Each one is metered. Additive. */
  bookings?: number;
  /** The metering period, ISO-8601 UTC: the Stripe billing period when a subscription is known, else the calendar month. Additive. */
  period_start?: string;
  period_end?: string;
  included_jobs: number | null;
  /** Whole percent of the allowance used (floored), null without an allowance */
  usage_percent: number | null;
  usage_state: UsageState;
  /** Completed jobs beyond the allowance, billed at month end */
  extra_jobs: number;
  extra_cost_cents: number;
  /** First day of the next month: when the count resets */
  resets_on: ISODate;
}

export interface PlanDTO {
  id: PlanKey;
  name: string;
  price_cents: number;
  currency: string;
  /** Completed jobs per month; null on Free (no AI companion) */
  included_jobs: number | null;
  /** Price of each completed job beyond the allowance; null on Free */
  extra_job_cents: number | null;
  has_companion: boolean;
  is_current: boolean;
  /** Always null: Stripe Checkout sessions expire and need the owner, so they are created on demand by POST /v1/billing/checkout */
  checkout_url: string | null;
  /** True when POST /v1/billing/checkout can start this plan (billing configured, paid plan, not the current one). Additive. */
  checkout_enabled?: boolean;
}

/** GET /v1/plans (member) */
export interface PlansDTO {
  current_plan: PlanKey;
  plans: PlanDTO[];
  /** The Stripe subscription behind the plan; null when there is none. Additive. */
  subscription?: SubscriptionDTO | null;
}

/** Stripe subscription status, passed through */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/** What the app may show about billing. No Stripe ids. */
export interface SubscriptionDTO {
  status: SubscriptionStatus | null;
  /** The paid tier the subscription is on */
  plan: PlanKey | null;
  /** ISO-8601 UTC end of the paid period (the next renewal) */
  current_period_end: string | null;
  /** True when the owner cancelled and access ends at current_period_end */
  cancel_at_period_end: boolean;
  /** Payment failed: access is kept while Stripe retries, the app should warn the owner */
  is_past_due: boolean;
  /** A downgrade that takes effect at the end of the paid period (the plan above stays until then); null when none. Additive. */
  scheduled_plan?: PlanKey | null;
  /** ISO-8601 UTC: when `scheduled_plan` takes effect (the current_period_end it was scheduled for) */
  scheduled_at?: string | null;
}

/** POST /v1/billing/checkout (owner only, Idempotency-Key) */
export interface CreateCheckoutRequest {
  plan: 'starter' | 'growth' | 'pro';
  /** Where the checkout page sends the owner after paying: `<scheme>://checkout(/...)` (clovie, clovie-preview or bookingadmin) */
  return_url?: string;
}
/**
 * POST /v1/billing/plan (owner only, Idempotency-Key): switch an existing subscription to another paid plan.
 * An upgrade is charged now (the proration invoice); a downgrade is scheduled for the end of the paid period.
 * Answers a ChangePlanResultDTO.
 */
export interface ChangePlanRequest {
  plan: 'starter' | 'growth' | 'pro';
  /** The preview's `proration_date` (unix seconds): charges exactly the amount that was shown. Rejected (422 PRORATION_DATE_STALE) when older than 15 minutes. */
  proration_date?: number;
}
/** GET /v1/billing/plan/preview?plan=pro (owner only): what changing to `plan` costs, without changing anything */
export interface PlanChangePreviewDTO {
  direction: 'upgrade' | 'downgrade' | 'same';
  plan: PlanKey;
  current_plan: PlanKey;
  /** Charged immediately: the proration delta for an upgrade (Stripe invoice preview), 0 for a downgrade or the same plan */
  amount_due_now_cents: number;
  /** ISO 4217 in upper case, e.g. 'ZAR' */
  currency: string;
  /** The recurring monthly price of `plan` (base fee, excluding extra jobs) charged from the next renewal */
  next_amount_cents: number;
  /** ISO-8601 UTC: now for an upgrade (and 'same'), the end of the paid period for a downgrade */
  effective_at: string;
  /** ISO-8601 UTC: the next renewal (end of the paid period); null when unknown */
  next_billing_at: string | null;
  /** Unix seconds the amount was computed at: pass it back as ChangePlanRequest.proration_date. Null unless direction is 'upgrade'. */
  proration_date: number | null;
}
/**
 * Answer of POST /v1/billing/plan.
 *  - active: the new plan is live (upgrade paid, or a scheduled downgrade cancelled by choosing the current plan)
 *  - requires_action: the card needs authentication; open `hosted_invoice_url`, the plan flips when Stripe confirms (refetch /v1/plans)
 *  - scheduled: a downgrade will take effect at `effective_at`; the current plan stays until then
 * A declined card answers 402 PAYMENT_FAILED and changes nothing.
 */
export type ChangePlanResultDTO =
  | { status: 'active'; plan: PlanKey }
  | { status: 'requires_action'; plan: PlanKey; hosted_invoice_url: string }
  | { status: 'scheduled'; plan: PlanKey; effective_at: string };
/** Open it in the browser; the plan flips when Stripe's webhook arrives, so refetch /v1/plans after returning */
export interface CheckoutSessionDTO {
  checkout_url: string;
  session_id?: string;
}
/** POST /v1/billing/portal (owner only, Idempotency-Key): manage, change or cancel the subscription */
export interface PortalSessionDTO {
  portal_url: string;
}

export type CompanionColorMode = 'light' | 'dark';

/** POST /v1/companion/session (member, feature `companion`) */
export interface CreateCompanionSessionRequest {
  color_mode: CompanionColorMode;
  /** Default 'web'. 'native' only changes the Nerova request when the backend has NEROVA_NATIVE_SESSIONS=true. */
  platform?: 'web' | 'native';
}

export interface CompanionSessionDTO {
  /** Frame this URL; it carries the session secret and expires at expires_at (15 minutes) */
  url: string;
  expires_at: ISODateTime;
  /** Native sessions only (platform 'native' with NEROVA_NATIVE_SESSIONS on): Nerova's session id */
  session_id?: string;
  /** Native sessions only: a secret the native widget needs with the url; never log it */
  state?: string | null;
}

/** `details.reason` of COMPANION_NOT_READY (HTTP 409) */
export type CompanionNotReadyReason =
  | 'account_not_found'
  | 'account_not_available'
  | 'origin_not_registered'
  | 'key_not_authorized'
  | 'not_provisioned'
  | 'setup_incomplete'
  | 'unavailable';

export interface CompanionNotReadyDetails {
  reason: CompanionNotReadyReason;
  /** Nerova's companion setup `nextStep` when known, e.g. `connect_whatsapp` */
  next_step?: string;
}

/** `next_step` of GET /v1/companion/setup: what the owner does next, or `none` */
export type CompanionSetupStep =
  | 'connect_booking_system'
  | 'verify_booking_connection'
  | 'provision_account'
  | 'connect_whatsapp'
  | 'go_live'
  | 'none';

/** WhatsApp number health, as Nerova reports it. Unknown future values arrive as `unknown`. */
export type WhatsAppPhoneNumberStatus =
  | 'connected'
  | 'pending'
  | 'flagged'
  | 'restricted'
  | 'disconnected'
  | 'unknown';
export type WhatsAppQualityRating = 'green' | 'yellow' | 'red' | 'unknown';
export type WhatsAppMessagingLimitTier =
  'tier_250' | 'tier_1k' | 'tier_10k' | 'tier_100k' | 'unlimited' | 'unknown';
export type WhatsAppNameStatus =
  | 'approved'
  | 'pending_review'
  | 'declined'
  | 'expired'
  | 'available_without_review'
  | 'none'
  | 'unknown';
export type WhatsAppHealthTemplateStatus =
  'approved' | 'pending' | 'rejected' | 'paused' | 'disabled' | 'unknown';

export interface WhatsAppHealthTemplateDTO {
  name: string;
  /** Meta category, passed through (e.g. `utility`, `marketing`); null when absent */
  category: string | null;
  status: WhatsAppHealthTemplateStatus;
  rejected_reason: string | null;
}

export interface WhatsAppLastErrorDTO {
  code: string | null;
  message: string;
  /** ISO-8601 instant, null when unknown */
  at: string | null;
}

/** The health fields of CompanionSetupDTO.whatsapp: all optional, absent until Nerova reports them */
export interface WhatsAppHealthDTO {
  phone_number_status?: WhatsAppPhoneNumberStatus | null;
  quality_rating?: WhatsAppQualityRating | null;
  messaging_limit_tier?: WhatsAppMessagingLimitTier | null;
  verified_name?: string | null;
  name_status?: WhatsAppNameStatus | null;
  templates?: WhatsAppHealthTemplateDTO[] | null;
  last_error?: WhatsAppLastErrorDTO | null;
  /** ISO-8601 instant of Nerova's last health check */
  last_health_check_at?: string | null;
}

/** GET /v1/companion/setup (owner) */
export interface CompanionSetupDTO {
  next_step: CompanionSetupStep;
  whatsapp: {
    connected: boolean;
    state: string;
    display_phone_number: string | null;
    business_verified: boolean;
    /** Nerova's verification status (e.g. `verified`, `pending`), null when unknown */
    business_verification_status: string | null;
  } & WhatsAppHealthDTO;
  /** Nerova account provisioned */
  provisioned: boolean;
  /** Booking connection status as Nerova reports it, null when unknown */
  booking_connection: string | null;
  /** What still blocks going live, e.g. `activation.channel_not_ready`; empty when nothing blocks */
  blocking_reasons: string[];
  companion_live: boolean;
}

/** Optional body of POST /v1/companion/whatsapp/connect-session */
export interface CompanionWhatsAppConnectSessionRequest {
  /** Where the hosted page sends the owner afterwards. Accepted now; forwarded once Nerova supports `returnUrl`. */
  return_url?: string;
}

/** POST /v1/companion/whatsapp/connect-session (owner), 201. Errors: 409 COMPANION_NOT_READY, 409 WHATSAPP_ALREADY_CONNECTED */
export interface CompanionWhatsAppConnectSessionDTO {
  /** Open in a browser tab; it carries a secret and expires at expires_at */
  launch_url: string;
  expires_at: ISODateTime;
}

/** Where a booking came from. The app's own bookings (walk-in, phone) are `manual`; `companion` is Nerova. */
export interface BookingsBySourceDTO {
  whatsapp: number;
  companion: number;
  manual: number;
  web: number;
}

export interface BusiestSlotDTO {
  /** 0 = Sunday */
  weekday: number;
  /** 0-23, business timezone */
  hour: number;
}

export interface WeeklyJobsDTO {
  /** Monday of the week (business timezone). Weeks at the month edges only count the month's jobs. */
  week_start: ISODate;
  completed_jobs: number;
}

/** What the companion did this (UTC) month, from Nerova's outcome summary. Counts only. */
export interface CompanionOutcomesDTO {
  bookings_created: number;
  bookings_rescheduled: number;
  bookings_cancelled: number;
  conversations_handled: number;
}

/** GET /v1/reports/summary?month=YYYY-MM (member, feature `reports`) */
export interface ReportsSummaryDTO {
  month: MonthKey;
  currency: string;
  completed_jobs: number;
  /** Sum of price_cents over the completed jobs */
  revenue_cents: number;
  /** Bookings created in the month (any status) */
  bookings_created: BookingsBySourceDTO;
  /** Appointments starting in the month */
  no_shows: number;
  cancellations: number;
  /** Over the completed jobs; null when there are none */
  busiest: BusiestSlotDTO | null;
  weekly: WeeklyJobsDTO[];
  /** null when Nerova is unavailable or the account is not linked; the rest of the report is still valid */
  companion: CompanionOutcomesDTO | null;
  usage: BillingUsageDTO;
}

/** GET /v1/voice/today: today's appointments for the voice check-in (also reachable with a device voice token) */
export interface VoiceTodayDTO {
  timezone: string;
  appointments: {
    id: UUID;
    starts_at: string;
    ends_at: string;
    status: string;
    checked_in_at: string | null;
    staff_id: UUID;
    /** First name only */
    client_first_name: string | null;
    service_name: string | null;
  }[];
}

/** POST /v1/voice/ask request (Clerk or device voice token; feature `companion`) */
export interface VoiceAskRequest {
  /** 1 to 4000 characters */
  text: string;
}

/** An owner approval the companion is waiting on (a booking, move or cancel). Decide it by id only. */
export interface VoiceApprovalDTO {
  /** `oapr_...` */
  id: string;
  /** e.g. `create_appointment`, `reschedule_appointment`, `cancel_appointment` */
  kind: string;
  /** One line, e.g. "Book Gel overlay for Thandi Ngwenya on Fri 16 Oct, 20:30-21:15?" */
  title: string;
  lines: { label: string; from: string | null; to: string }[];
}

/**
 * An action the companion already EXECUTED under act-then-undo (a low-risk booking). The owner hears `readBack`
 * and may undo until `undoUntil`; an undone action is re-sent with status `undone`.
 */
export interface VoiceActionDTO {
  /** `oact_...` */
  id: string;
  /** e.g. `create_appointment` */
  kind: string;
  status: 'executed' | 'undone';
  title: string;
  /** What to say aloud, e.g. "Done. Gel overlay for Thandi on Fri 16 Oct, 20:30. Say undo if that's wrong." */
  readBack: string;
  lines: { label: string; from: string | null; to: string }[];
  /** ISO-8601 UTC */
  executedAt: string | null;
  undoUntil: string | null;
  undoable: boolean;
  /** Present when status is `undone` */
  undoneAt?: string;
}

/** GET/PATCH /v1/companion/settings response data (Nerova companion settings) */
export interface CompanionSettingsDTO {
  approvalPolicy: 'always' | 'risky_only' | 'never';
  /** 0 (no undo window) to 120 seconds */
  undoWindowSeconds: number;
  updatedAt: string | null;
}

/** POST /v1/voice/ask response data: the companion's whole reply, ready to speak */
export interface VoiceAskDTO {
  reply: string;
  approvals: VoiceApprovalDTO[];
  /** Actions executed in this turn (act-then-undo); an executed action does not set `awaitingReply`. Always sent by the API. */
  actions?: VoiceActionDTO[];
  suggestions: string[];
  /** Nerova `done.awaitingReply` when present; overrides the app's question heuristic both ways */
  awaitingReply?: boolean;
}

/** POST /v1/voice/approvals/:id/approve and /decline response data */
export interface VoiceApprovalResultDTO {
  id: string;
  decision: 'approved' | 'declined';
  kind: string | null;
}

// ---------------------------------------------------------------------------
// Clovie stories (docs/stories.md)
// ---------------------------------------------------------------------------

export type StoryKind = 'brief' | 'clients' | 'business';
export type StoryTone = 'positive' | 'neutral' | 'attention' | 'concern';
export type StoryEmotion =
  | 'delighted'
  | 'proud'
  | 'curious'
  | 'thoughtful'
  | 'sympathetic'
  | 'presenter'
  | 'sleepy';

/** One card of a story. Every value comes from the business's own data and a fixed English template. */
export interface StoryCardDTO {
  id: string;
  tone: StoryTone;
  kicker: string;
  headline: string;
  body?: string;
  /** `count` and `percent` are plain numbers; `money` is integer cents in the business currency */
  number?: {
    value: number;
    format: 'count' | 'money' | 'percent';
    unit?: string;
  };
  list?: { name: string; initials: string; detail: string }[];
  /** `kind` is an in-app action the app handles (e.g. `invite_lapsed`); `deeplink` is a URL such as `clovie://voice` */
  action?: { label: string; kind?: string; deeplink?: string };
  emotion?: StoryEmotion;
  /** Product updates only: the client-side demo id (e.g. `undo`, `names`) */
  demo?: string;
}

export interface StoryDTO {
  id: string;
  kind: StoryKind;
  title: string;
  tone: StoryTone;
  /** ISO-8601 UTC */
  generatedAt: string;
  /** True once the caller has opened this story (per person) */
  viewed: boolean;
  cards: StoryCardDTO[];
}

/** GET /v1/stories response data: Brief, Client updates, Business update, then Product updates. Empty stories are omitted. */
export interface StoriesResponseDTO {
  stories: StoryDTO[];
  /** Unseen, approved product updates for this caller (at most 3, newest first); `viewed` is false whenever there are cards */
  productUpdates: { viewed: boolean; cards: StoryCardDTO[] };
}

/** POST /v1/stories/:id/view body */
export interface StoryViewRequest {
  lastCardIndex: number;
}

/** POST /v1/product-updates/view body: product update ids (the same as the product update card ids) */
export interface ProductUpdatesViewRequest {
  ids: string[];
}

export type StoryEventName =
  'open' | 'card_view' | 'complete' | 'skip' | 'close' | 'action';

/** One analytics event; ids, kind and a card index only, never personal data */
export interface StoryEventDTO {
  storyKind: StoryKind | 'product';
  storyId?: string | null;
  cardIndex: number;
  event: StoryEventName;
  /** ISO-8601 UTC; defaults to the server time */
  at?: string;
}

/** POST /v1/stories/events body: up to 50 events */
export interface StoryEventsRequest {
  events: StoryEventDTO[];
}
