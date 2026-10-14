/**
 * WhatsApp Flows data_exchange endpoint (decrypted side).
 *
 * The endpoint is stateless: every screen's data carries the selections made
 * so far and the footer sends them back. Every step is re-validated against
 * live availability through BookingService.
 *
 * Booking:    SERVICE → DATETIME → SUMMARY (`complete`; the engine books on the nfm_reply), see bookingFlow.ts
 * Reschedule: DATE → SLOT → SUMMARY → SUCCESS (the move happens here on SUMMARY confirm)
 */
import { z } from 'zod';

import type { AppointmentDTO } from '../../../../../packages/shared/api.ts';
import type { WaDeps } from '../deps.ts';
import { mapBookingError } from '../engine/executor.ts';
import { addDays, dateOf, shortDate, summaryLines, timeOf, todayIn } from '../format.ts';
import { isCalendarDate, isUuid, parseReplyId, rid } from '../ids.ts';
import { escalate } from '../outbound.ts';
import { bookingFlow } from './bookingFlow.ts';
import { FLOW_COPY, FLOW_DATA_VERSION, screen, stay, type FlowRequest, type FlowResult, type Session } from './session.ts';
import { verifyFlowToken } from './token.ts';

export { FLOW_COPY } from './session.ts';
export type { FlowRequest, FlowResult } from './session.ts';

export async function handleFlowRequest(deps: WaDeps, req: FlowRequest): Promise<FlowResult> {
  if (req.action === 'ping') return { status: 200, body: { version: FLOW_DATA_VERSION, data: { status: 'active' } } };

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
    return { status: 200, body: { version: FLOW_DATA_VERSION, data: { acknowledged: true } } };
  }

  if (!check?.ok) return { status: 427 };
  const conv = await deps.repo.getConversation(check.claims.conversationId);
  if (!conv) return { status: 427 };
  // Plan gate: a business without the whatsapp_menu feature has no live flows; close any stale one.
  if (!(await deps.entitlements.hasFeature(conv.business_id, 'whatsapp_menu'))) return { status: 427 };
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

// ---------------------------------------------------------------- selection

const Sel = z.object({
  service_id: z.string().refine(isUuid).optional(),
  staff_id: z.string().refine((v) => v === 'any' || isUuid(v)).optional(),
  date: z.string().refine(isCalendarDate).optional(),
  slot: z.string().optional(),
});

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

function success(s: Session, flow: 'booking' | 'reschedule', appt: AppointmentDTO): FlowResult {
  return {
    status: 200,
    body: {
      screen: 'SUCCESS',
      data: { extension_message_response: { params: { flow_token: s.token, appointment_id: appt.id, flow } } },
    },
  };
}
