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
export type ActorType = 'customer' | 'staff' | 'system' | 'nerova';

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
  | 'UPSTREAM_COMPANION_ERROR'
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

// ---------- plans, usage, companion, reports ----------
/** Month key in the business timezone, `YYYY-MM` */
export type MonthKey = string;

/** `normal` below 80% of the included jobs, `near` from 80% up to and including 100%, `over` beyond it. Never a cut-off. */
export type UsageState = 'normal' | 'near' | 'over';

/** GET /v1/billing/usage?month=YYYY-MM (member). Free plans have no allowance: included_jobs/usage_percent are null. */
export interface BillingUsageDTO {
  plan: PlanKey;
  month: MonthKey;
  /** Appointments that ended in the month (business timezone) and are neither cancelled nor no-show */
  completed_jobs: number;
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
  /** Purchase stays on the web for now: always null */
  checkout_url: string | null;
}

/** GET /v1/plans (member) */
export interface PlansDTO {
  current_plan: PlanKey;
  plans: PlanDTO[];
}

export type CompanionColorMode = 'light' | 'dark';

/** POST /v1/companion/session (member, feature `companion`) */
export interface CreateCompanionSessionRequest {
  color_mode: CompanionColorMode;
}

export interface CompanionSessionDTO {
  /** Frame this URL; it carries the session secret and expires at expires_at (15 minutes) */
  url: string;
  expires_at: ISODateTime;
}

/** `details.reason` of COMPANION_NOT_READY (HTTP 409) */
export type CompanionNotReadyReason =
  'account_not_found' | 'not_provisioned' | 'setup_incomplete' | 'unavailable';

export interface CompanionNotReadyDetails {
  reason: CompanionNotReadyReason;
  /** Nerova's companion setup `nextStep` when known, e.g. `connect_whatsapp` */
  next_step?: string;
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
