/**
 * zod v4 request schemas matching @booking/types. Unknown keys are stripped.
 * Optional DTO fields that have sensible defaults are accepted as optional.
 */
import { z } from 'zod';

import { findRepeatedWeekday } from '@booking/features/availability/lib/hours.ts';
import { isIsoDate, isTimeOfDay, isValidTimeZone, parseTimeOfDay, diffDays } from '@booking/features/lib/time.ts';

export const uuid = z.guid();
export const isoDate = z.string().refine(isIsoDate, 'Expected a date YYYY-MM-DD');
export const timeOfDay = z.string().refine(isTimeOfDay, 'Expected a time HH:mm');
export const instant = z.iso.datetime({ offset: true });

const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => text(max).nullable().optional();
const weekday = z.number().int().min(0).max(6);
/** False for malformed or missing times, so a refine never throws while the field checks are still reporting. */
export const endAfterStart = (start?: string | null, end?: string | null) =>
  !!start && !!end && isTimeOfDay(start) && isTimeOfDay(end) && parseTimeOfDay(end) > parseTimeOfDay(start);

/** Weekly hours allow one range per weekday; a lunch gap is a staff break. */
export const oneRangePerWeekday = (rows: { weekday: number }[]) => findRepeatedWeekday(rows) === null;
export const ONE_RANGE_MESSAGE = 'At most one range per weekday; use a break for a gap';

// ---------- business ----------

export const bookingRulesPatch = z
  .object({
    lead_time_minutes: z.number().int().min(0).max(10_080),
    cancellation_window_minutes: z.number().int().min(0).max(20_160),
    buffer_minutes: z.number().int().min(0).max(240),
    slot_interval_minutes: z.number().int().min(5).max(240),
    booking_horizon_days: z.number().int().min(0).max(365),
    reminder_offsets_minutes: z.array(z.number().int().min(1).max(10_080)).max(5),
    allow_staff_selection: z.boolean(),
  })
  .partial();

export const updateBusinessSchema = z.object({
  name: text(120).min(1).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'Lowercase letters, digits and hyphens')
    .optional(),
  timezone: z.string().refine(isValidTimeZone, 'Unknown IANA timezone').optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code').optional(),
  logo_url: z.url().max(2048).nullable().optional(),
  address: nullableText(300),
  phone: nullableText(32),
  email: z.email().max(254).nullable().optional(),
  booking_rules: bookingRulesPatch.optional(),
  attendance_mode: z.enum(['staff', 'owner']).optional(),
});

export const hoursRow = z
  .object({ weekday, opens_at: timeOfDay, closes_at: timeOfDay })
  .refine((r) => endAfterStart(r.opens_at, r.closes_at), 'closes_at must be after opens_at');

export const replaceHoursSchema = z.object({ hours: z.array(hoursRow).max(7).refine(oneRangePerWeekday, ONE_RANGE_MESSAGE) });

// ---------- services & staff ----------

const serviceFields = {
  name: text(120).min(1),
  description: nullableText(2000),
  category: nullableText(80),
  duration_minutes: z.number().int().min(1).max(720),
  price_cents: z.number().int().min(0),
  deposit_cents: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  staff_ids: z.array(uuid).max(200).optional(),
};

export const createServiceSchema = z.object(serviceFields);
export const updateServiceSchema = z.object(serviceFields).partial();

const staffFields = {
  user_id: z.string().max(100).nullable().optional(),
  name: text(120).min(1),
  title: nullableText(80),
  photo_url: z.url().max(2048).nullable().optional(),
  phone: nullableText(32),
  email: z.email().max(254).nullable().optional(),
  color: nullableText(32),
  is_active: z.boolean().optional(),
  accepts_bookings: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  service_ids: z.array(uuid).max(200).optional(),
};

export const createStaffSchema = z.object(staffFields);
export const updateStaffSchema = z.object(staffFields).partial();

export const staffServicesSchema = z.object({ service_ids: z.array(uuid).max(200) });

const ruleRow = z
  .object({ weekday, start_time: timeOfDay, end_time: timeOfDay })
  .refine((r) => endAfterStart(r.start_time, r.end_time), 'end_time must be after start_time');

export const staffAvailabilitySchema = z.object({ rules: z.array(ruleRow).max(7).refine(oneRangePerWeekday, ONE_RANGE_MESSAGE) });

export const createOverrideSchema = z
  .object({
    staff_id: uuid.nullable().optional(),
    date: isoDate,
    is_closed: z.boolean(),
    start_time: timeOfDay.nullable().optional(),
    end_time: timeOfDay.nullable().optional(),
    reason: nullableText(200),
  })
  .refine(
    (o) => o.is_closed || (!!o.start_time && !!o.end_time && endAfterStart(o.start_time, o.end_time)),
    'An open override needs start_time < end_time',
  );

// ---------- clients ----------

const clientFields = {
  phone: z.string().min(1).max(32),
  name: nullableText(120),
  email: z.email().max(254).nullable().optional(),
  notes: nullableText(2000),
  tags: z.array(text(32).min(1)).max(20).optional(),
};

export const createClientSchema = z.object(clientFields);
export const updateClientSchema = z
  .object(clientFields)
  .partial()
  .extend({ is_blocked: z.boolean().optional(), whatsapp_opt_in: z.boolean().optional() });

export const createClientNoteSchema = z.object({
  body: text(2000).min(1),
  kind: z.enum(['general', 'warning', 'preference']).optional(),
});

// ---------- availability ----------

export const MAX_DAYS_RANGE = 93;

export const daysQuerySchema = z
  .object({ service_id: uuid, from: isoDate, to: isoDate, staff_id: uuid.optional() })
  .refine((q) => q.to >= q.from, 'to must not be before from')
  .refine((q) => diffDays(q.from, q.to) < MAX_DAYS_RANGE, `Range is limited to ${MAX_DAYS_RANGE} days`);

export const slotsQuerySchema = z.object({ service_id: uuid, date: isoDate, staff_id: uuid.optional() });

// ---------- appointments ----------

export const createAppointmentSchema = z
  .object({
    client_id: uuid.optional(),
    new_client: createClientSchema.optional(),
    service_id: uuid,
    staff_id: uuid.nullable().optional(),
    starts_at: instant,
    notes: nullableText(2000),
    send_whatsapp_confirmation: z.boolean().optional(),
    allow_outside_hours: z.boolean().optional(),
  })
  .refine((b) => !!b.client_id !== !!b.new_client, 'Provide exactly one of client_id or new_client');

export const rescheduleSchema = z.object({
  starts_at: instant,
  staff_id: uuid.nullable().optional(),
  notify_customer: z.boolean().optional(),
});

export const cancelSchema = z.object({
  reason: nullableText(500),
  notify_customer: z.boolean().optional(),
});

export const statusSchema = z.object({ status: z.enum(['completed', 'no_show']) });

export const updateAppointmentSchema = z.object({ notes: text(2000).nullable() });

export const registerDeviceSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android', 'web']),
});

export const unregisterDeviceSchema = z.object({ token: z.string().min(1).max(512) });

// ---------- public ----------

export const slugParam = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

export const attemptStepSchema = z.object({
  step: z.string().regex(/^[a-z0-9][a-z0-9_:.-]{0,63}$/, 'Lowercase step id (no free text)'),
});

export const publicBookingSchema = z.object({
  attempt_id: uuid.optional(),
  service_id: uuid,
  staff_id: uuid.nullable().optional(),
  starts_at: instant,
  name: text(120).min(1),
  phone: z.string().min(1).max(32),
  email: z.email().max(254).nullable().optional(),
});

// ---------- onboarding ----------

export const onboardingSchema = z.object({
  business: z.object({ name: text(120).min(1) }),
  owner_name: nullableText(120),
  hours: z.array(hoursRow).min(1).max(7).refine(oneRangePerWeekday, ONE_RANGE_MESSAGE),
  services: z
    .array(
      z.object({
        name: text(120).min(1),
        duration_minutes: z.number().int().min(1).max(720),
        price_cents: z.number().int().min(0).max(100_000_000),
      }),
    )
    .max(20),
  team: z.array(z.object({ name: text(120).min(1), title: nullableText(80) })).max(20),
  revise: z.boolean().optional(),
});

// ---------- team ----------

const memberRole = z.enum(['owner', 'staff']);

export const createInvitationSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  role: memberRole,
  staff_id: uuid.nullable().optional(),
});

export const updateMemberRoleSchema = z.object({ role: memberRole });

export const deleteAccountSchema = z.object({ confirm_business_name: z.string().max(200).optional() });

// ---------- plans, usage, companion, reports ----------

/** `YYYY-MM`, optional: the route defaults to the current month in the business timezone. */
export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month YYYY-MM').optional() });

/** Optional body: the app sends none today. `return_url` is accepted ahead of Nerova supporting `returnUrl`. */
export const connectWhatsAppSessionSchema = z.object({ return_url: z.url().max(2048).optional() });

export const createCompanionSessionSchema = z.object({ color_mode: z.enum(['light', 'dark']), platform: z.enum(['web', 'native']).default('web') });

/** PATCH /v1/companion/settings: partial, camelCase like Nerova's body; at least one field. */
export const companionSettingsPatchSchema = z
  .object({
    approvalPolicy: z.enum(['always', 'risky_only', 'never']).optional(),
    undoWindowSeconds: z.number().int().min(0).max(120).optional(),
  })
  .refine((v) => v.approvalPolicy !== undefined || v.undoWindowSeconds !== undefined, 'Send approvalPolicy and/or undoWindowSeconds');

// ---------- attendance check ----------

export const answerAttendanceSchema = z.object({ outcome: z.enum(['came', 'no_show']) });
