/**
 * WhatsApp Flows data_exchange endpoint (decrypted side).
 *
 * The endpoint is stateless: every screen's data carries the selections made
 * so far and the footer sends them back. Every step is re-validated against
 * live availability through BookingService, and the booking itself is only
 * written on SUMMARY confirm.
 *
 * Booking:    SERVICE → STAFF (skipped when not needed) → DATE → SLOT → DETAILS → SUMMARY → SUCCESS
 * Reschedule: DATE → SLOT → SUMMARY → SUCCESS
 */
import { z } from 'zod';

import type { AppointmentDTO, BusinessDTO } from '../../../../../packages/shared/api.ts';
import type { WaDeps } from '../deps.ts';
import { mapBookingError } from '../engine/executor.ts';
import { addDays, dateOf, money, shortDate, summaryLines, timeOf, todayIn } from '../format.ts';
import { isCalendarDate, isUuid, parseReplyId, rid } from '../ids.ts';
import { escalate } from '../outbound.ts';
import type { ClientRow, ConversationRow } from '../repo.ts';
import { verifyFlowToken, type FlowTokenClaims } from './token.ts';

export interface FlowRequest {
  version?: string;
  action?: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

export type FlowResult = { status: 200; body: Record<string, unknown> } | { status: 427 };

export const FLOW_COPY = {
  noDates: 'Sorry, there are no open dates for this right now.',
  noSlots: 'Sorry, there are no times left on that day. Please pick another date.',
  slotTaken: 'Sorry, that slot was just taken. Please pick another time.',
  slotTakenBack: 'Sorry, that slot was just taken. Please go back and pick another time.',
  noSlotsBack: 'Sorry, there are no times left on that day. Please go back and pick another date.',
  invalid: 'Please check your selection and try again.',
  invalidDetails: 'Please enter your name and a valid email address (or leave email empty).',
  failed: "Sorry, we couldn't complete that. Please try again.",
  window: "Sorry, this booking can't be changed online this close to the start time.",
  anyStaff: 'No preference',
} as const;

interface Session {
  deps: WaDeps;
  token: string;
  claims: FlowTokenClaims;
  conv: ConversationRow;
  client: ClientRow;
  business: BusinessDTO;
  now: Date;
}

const screen = (name: string, data: Record<string, unknown>): FlowResult => ({ status: 200, body: { screen: name, data } });
/**
 * Flow routing is forward-only, so every error keeps the customer on the
 * screen they submitted, with an `error_message`.
 */
const stay = (name: string | undefined, error: string): FlowResult => screen(name ?? 'SERVICE', { error_message: error });

export async function handleFlowRequest(deps: WaDeps, req: FlowRequest): Promise<FlowResult> {
  if (req.action === 'ping') return { status: 200, body: { data: { status: 'active' } } };

  const now = deps.now();
  const secret = deps.env.FLOW_TOKEN_SECRET;
  const check = secret ? verifyFlowToken(secret, req.flow_token, now) : null;

  // Client-side error notification: acknowledge, and flag it for staff.
  if (req.data && 'error' in req.data) {
    if (check?.ok) {
      const conv = await deps.repo.getConversation(check.claims.conversationId);
      if (conv) {
        await escalate(deps, { businessId: conv.business_id, conversationId: conv.id, clientId: conv.client_id, reason: 'flow_error' }).catch(() => undefined);
      }
    }
    deps.logger.warn('wa_flow_client_error', { error_code: String((req.data as { error?: unknown }).error ?? '') });
    return { status: 200, body: { data: { acknowledged: true } } };
  }

  if (!check?.ok) return { status: 427 };
  const conv = await deps.repo.getConversation(check.claims.conversationId);
  if (!conv) return { status: 427 };
  const client = await deps.repo.getClient(conv.business_id, conv.client_id);
  if (!client) return { status: 427 };
  const business = await deps.booking.getBusiness(conv.business_id);
  const s: Session = { deps, token: req.flow_token!, claims: check.claims, conv, client, business, now };

  const result = check.claims.kind === 'booking' ? await bookingFlow(s, req) : await rescheduleFlow(s, req);
  if (result.status === 200 && check.claims.attemptId && typeof result.body.screen === 'string') {
    await deps.repo.appendAttemptStep(check.claims.attemptId, `flow:${result.body.screen}`, now.toISOString()).catch(() => undefined);
  }
  return result;
}

// ---------------------------------------------------------------- booking flow

const Sel = z.object({
  service_id: z.string().refine(isUuid).optional(),
  staff_id: z.string().refine((v) => v === 'any' || isUuid(v)).optional(),
  date: z.string().refine(isCalendarDate).optional(),
  slot: z.string().optional(),
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().max(200).optional(),
});
type Selection = z.infer<typeof Sel>;

async function bookingFlow(s: Session, req: FlowRequest): Promise<FlowResult> {
  if (req.action === 'INIT' || req.action === 'BACK') return serviceScreen(s);
  if (req.action !== 'data_exchange') return stay(req.screen, FLOW_COPY.invalid);
  const parsed = Sel.safeParse(req.data ?? {});
  if (!parsed.success) return stay(req.screen, FLOW_COPY.invalid);
  const sel = parsed.data;

  const services = await s.deps.booking.listServices(s.business.id, { activeOnly: true });
  const service = services.find((x) => x.id === sel.service_id);
  if (!service) return req.screen === 'SERVICE' ? serviceScreen(s, FLOW_COPY.invalid) : stay(req.screen, FLOW_COPY.invalid);

  switch (req.screen) {
    case 'SERVICE': {
      const staff = await s.deps.booking.listBookableStaff(s.business.id, service.id);
      if (s.business.booking_rules.allow_staff_selection && staff.length > 1) {
        return screen('STAFF', {
          service_id: service.id,
          staff: [{ id: 'any', title: FLOW_COPY.anyStaff }, ...staff.map((x) => ({ id: x.id, title: x.name.slice(0, 30) }))],
        });
      }
      return dateScreen(s, { service_id: service.id, staff_id: 'any' });
    }
    case 'STAFF':
    case 'DATE':
    case 'SLOT':
    case 'DETAILS':
    case 'SUMMARY': {
      const staffId = sel.staff_id ?? 'any';
      if (staffId !== 'any') {
        const staff = await s.deps.booking.listBookableStaff(s.business.id, service.id);
        if (!staff.some((x) => x.id === staffId)) return stay(req.screen, FLOW_COPY.invalid);
      }
      const carry = { service_id: service.id, staff_id: staffId };
      if (req.screen === 'STAFF') return dateScreen(s, carry);
      if (!sel.date) return req.screen === 'DATE' ? dateScreen(s, carry, FLOW_COPY.invalid) : stay(req.screen, FLOW_COPY.invalid);
      if (req.screen === 'DATE') return slotScreen(s, 'DATE', { ...carry, date: sel.date });

      if (req.screen === 'SUMMARY') {
        // The booking service re-validates live and replays by idempotency key,
        // so a retried SUMMARY returns the same appointment instead of "taken".
        const chosen = slotFromId(sel.slot, staffId, sel.date, s.business.timezone);
        const details = validDetails(sel);
        if (!chosen || !details) return stay('SUMMARY', FLOW_COPY.invalid);
        return createBooking(s, service.id, chosen, sel.slot!, details);
      }

      const slot = await validSlot(s, service.id, staffId, sel.date, sel.slot);
      if (!slot) {
        return req.screen === 'SLOT'
          ? slotScreen(s, 'SLOT', { ...carry, date: sel.date }, FLOW_COPY.slotTaken)
          : stay(req.screen, FLOW_COPY.slotTakenBack);
      }
      const withSlot = { ...carry, date: sel.date, slot: sel.slot! };
      if (req.screen === 'SLOT') {
        return screen('DETAILS', { ...withSlot, name: s.client.name ?? '', email: s.client.email ?? '' });
      }

      const details = validDetails(sel);
      if (!details) return stay('DETAILS', FLOW_COPY.invalidDetails);
      const staffName = staffId === 'any' ? null : (await s.deps.booking.listBookableStaff(s.business.id, service.id)).find((x) => x.id === staffId)?.name ?? null;
      const summary = summaryLines(
        {
          service: service.name,
          startsAt: slot.startsAt,
          staff: staffName ?? FLOW_COPY.anyStaff,
          price: service.price_cents > 0 ? money(service.price_cents, s.business.currency) : null,
        },
        s.business.timezone,
      );
      return screen('SUMMARY', { ...withSlot, name: details.name, email: details.email ?? '', summary });
    }
    default:
      return stay(req.screen, FLOW_COPY.invalid);
  }
}

async function createBooking(
  s: Session,
  serviceId: string,
  slot: { startsAt: string; staffId: string | null },
  slotId: string,
  details: { name: string; email: string | null },
): Promise<FlowResult> {
  const attemptId = s.claims.attemptId;
  try {
    const appt = await s.deps.booking.createAppointment({
      businessId: s.business.id,
      clientId: s.client.id,
      serviceId,
      staffId: slot.staffId,
      startsAt: slot.startsAt,
      source: 'whatsapp',
      idempotencyKey: `wa-flow:${s.token}:${slotId}`,
      actor: { type: 'customer', id: s.client.id },
      notifyCustomer: false,
      now: s.now,
    });
    await s.deps.repo
      .updateClientDetails(s.business.id, s.client.id, {
        ...(!s.client.name ? { name: details.name } : {}),
        ...(!s.client.email && details.email ? { email: details.email } : {}),
      })
      .catch(() => undefined);
    if (attemptId) {
      await s.deps.repo.finishAttempt(attemptId, 'completed', { appointmentId: appt.id, at: s.now.toISOString() }).catch(() => undefined);
    }
    return success(s, 'booking', appt);
  } catch (err) {
    const mapped = mapBookingError(err);
    s.deps.logger.warn('wa_flow_booking_failed', { detail: mapped.detail });
    if (attemptId && mapped.code !== 'SLOT_UNAVAILABLE') {
      await s.deps.repo.appendAttemptStep(attemptId, `flow:error:${mapped.detail}`.slice(0, 64), s.now.toISOString()).catch(() => undefined);
    }
    return stay('SUMMARY', mapped.code === 'SLOT_UNAVAILABLE' ? FLOW_COPY.slotTakenBack : FLOW_COPY.failed);
  }
}

// ---------------------------------------------------------------- reschedule flow

async function rescheduleFlow(s: Session, req: FlowRequest): Promise<FlowResult> {
  const appt = s.claims.appointmentId ? await s.deps.booking.getAppointment(s.business.id, s.claims.appointmentId) : null;
  if (!appt || appt.client_id !== s.client.id || appt.status !== 'confirmed' || Date.parse(appt.starts_at) <= s.now.getTime()) {
    return { status: 427 };
  }
  const carry = { service_id: appt.service_id, staff_id: appt.staff_id };
  if (req.action === 'INIT' || req.action === 'BACK') return dateScreen(s, carry);
  const parsed = Sel.safeParse(req.data ?? {});
  if (req.action !== 'data_exchange' || !parsed.success) return stay(req.screen, FLOW_COPY.invalid);
  const sel = parsed.data;
  if (!sel.date) return req.screen === 'DATE' ? dateScreen(s, carry, FLOW_COPY.invalid) : stay(req.screen, FLOW_COPY.invalid);

  switch (req.screen) {
    case 'DATE':
      return slotScreen(s, 'DATE', { ...carry, date: sel.date });
    case 'SUMMARY': {
      const chosen = slotFromId(sel.slot, appt.staff_id, sel.date, s.business.timezone);
      if (!chosen) return stay('SUMMARY', FLOW_COPY.invalid);
      // A retried SUMMARY after a successful move: answer with the same result.
      if (Date.parse(appt.starts_at) === Date.parse(chosen.startsAt)) return success(s, 'reschedule', appt);
      try {
        const moved = await s.deps.booking.rescheduleAppointment({
          businessId: s.business.id,
          appointmentId: appt.id,
          startsAt: chosen.startsAt,
          staffId: appt.staff_id,
          actor: { type: 'customer', id: s.client.id },
          notifyCustomer: false,
          now: s.now,
        });
        return success(s, 'reschedule', moved);
      } catch (err) {
        const mapped = mapBookingError(err);
        const message =
          mapped.code === 'SLOT_UNAVAILABLE' ? FLOW_COPY.slotTakenBack : mapped.code === 'CANCELLATION_WINDOW' ? FLOW_COPY.window : FLOW_COPY.failed;
        return stay('SUMMARY', message);
      }
    }
    case 'SLOT': {
      const slot = await validSlot(s, appt.service_id, appt.staff_id, sel.date, sel.slot);
      if (!slot) return slotScreen(s, 'SLOT', { ...carry, date: sel.date }, FLOW_COPY.slotTaken);
      const services = await s.deps.booking.listServices(s.business.id, { activeOnly: true });
      const staff = await s.deps.booking.listBookableStaff(s.business.id, appt.service_id);
      const summary = summaryLines(
        {
          service: services.find((x) => x.id === appt.service_id)?.name ?? 'Appointment',
          startsAt: slot.startsAt,
          staff: staff.find((x) => x.id === appt.staff_id)?.name ?? null,
        },
        s.business.timezone,
      );
      return screen('SUMMARY', { ...carry, date: sel.date, slot: sel.slot!, summary });
    }
    default:
      return stay(req.screen, FLOW_COPY.invalid);
  }
}

// ---------------------------------------------------------------- shared screens

async function serviceScreen(s: Session, error?: string): Promise<FlowResult> {
  const services = await s.deps.booking.listServices(s.business.id, { activeOnly: true });
  return screen('SERVICE', {
    services: services.map((x) => ({
      id: x.id,
      title: x.name.slice(0, 30),
      description: [`${x.duration_minutes} min`, x.price_cents > 0 ? money(x.price_cents, s.business.currency) : null].filter(Boolean).join(' · '),
    })),
    ...(error ? { error_message: error } : {}),
  });
}

async function dateScreen(s: Session, carry: { service_id: string; staff_id: string }, error?: string): Promise<FlowResult> {
  const name = 'DATE';
  const tz = s.business.timezone;
  const from = todayIn(tz, s.now);
  const to = addDays(from, s.business.booking_rules.booking_horizon_days, tz);
  const days = await s.deps.booking.listAvailableDays({
    businessId: s.business.id,
    serviceId: carry.service_id,
    staffId: carry.staff_id === 'any' ? null : carry.staff_id,
    from,
    to,
    now: s.now,
  });
  if (days.length === 0) {
    return screen(name, { ...carry, min_date: from, max_date: from, unavailable_dates: [from], error_message: FLOW_COPY.noDates });
  }
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const open = new Set(days);
  const unavailable: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1, tz)) if (!open.has(d)) unavailable.push(d);
  return screen(name, { ...carry, min_date: first, max_date: last, unavailable_dates: unavailable, ...(error ? { error_message: error } : {}) });
}

/** SLOT screen; `from` is the screen that was submitted (DATE, or SLOT for a same-screen refresh). */
async function slotScreen(
  s: Session,
  from: 'DATE' | 'SLOT',
  carry: { service_id: string; staff_id: string; date: string },
  error?: string,
): Promise<FlowResult> {
  const staffId = carry.staff_id === 'any' ? null : carry.staff_id;
  const { slots } = await s.deps.booking.listAvailableSlots({
    businessId: s.business.id,
    serviceId: carry.service_id,
    staffId,
    date: carry.date,
    now: s.now,
  });
  if (slots.length === 0) {
    return from === 'DATE' ? dateScreen(s, { service_id: carry.service_id, staff_id: carry.staff_id }, FLOW_COPY.noSlots) : stay('SLOT', FLOW_COPY.noSlotsBack);
  }
  const tz = s.business.timezone;
  return screen('SLOT', {
    ...carry,
    date_label: shortDate(carry.date, tz),
    slots: slots.map((x) => ({ id: rid.slot(x.starts_at, staffId), title: timeOf(x.starts_at, tz) })),
    ...(error ? { error_message: error } : {}),
  });
}

async function validSlot(
  s: Session,
  serviceId: string,
  staffSel: string,
  date: string,
  slotId: string | undefined,
): Promise<{ startsAt: string; staffId: string | null } | null> {
  const chosen = slotFromId(slotId, staffSel, date, s.business.timezone);
  if (!chosen) return null;
  const { slots } = await s.deps.booking.listAvailableSlots({ businessId: s.business.id, serviceId, staffId: chosen.staffId, date, now: s.now });
  const match = slots.find((x) => Date.parse(x.starts_at) === Date.parse(chosen.startsAt));
  return match ? { startsAt: match.starts_at, staffId: chosen.staffId } : null;
}

/** Parses a `slot:<iso>|<staff>` id and checks it belongs to the selected staff and date. */
function slotFromId(slotId: string | undefined, staffSel: string, date: string, tz: string): { startsAt: string; staffId: string | null } | null {
  const parsed = parseReplyId(slotId);
  if (!parsed || parsed.t !== 'slot') return null;
  const staffId = staffSel === 'any' ? null : staffSel;
  if (parsed.staffId !== staffId || dateOf(parsed.startsAt, tz) !== date) return null;
  return { startsAt: new Date(parsed.startsAt).toISOString(), staffId };
}

function validDetails(sel: Selection): { name: string; email: string | null } | null {
  const name = (sel.name ?? '').trim();
  if (name.length < 1) return null;
  const email = (sel.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { name, email: email || null };
}

function success(s: Session, flow: 'booking' | 'reschedule', appt: AppointmentDTO): FlowResult {
  return {
    status: 200,
    body: {
      screen: 'SUCCESS',
      data: { extension_message_response: { params: { flow_token: s.token, appointment_id: appt.id, flow } } },
    },
  };
}
