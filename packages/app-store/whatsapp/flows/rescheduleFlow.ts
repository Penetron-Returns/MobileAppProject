/**
 * Reschedule Flow data_exchange (DATETIME → SUMMARY), served for
 * `whatsapp/flows/reschedule.json` (`reschedule_v2`). Stateless like the
 * booking Flow: the token names the appointment, and the service and staff
 * member are always the appointment's own. Nothing is written here. The
 * terminal SUMMARY `complete` returns to the chat as an nfm_reply, and the
 * conversation engine moves the appointment (engine/transition.ts →
 * `reschedule_booking`).
 *
 * Triggers (payload `trigger`):
 *   date_selected  DATETIME → DATETIME, with that day's time chips
 *   continue       DATETIME → SUMMARY (slot re-validated), or DATETIME again when it vanished
 * Actions: INIT → DATETIME, BACK (DATETIME `refresh_on_back`) → fresh DATETIME.
 * A cancelled, past or foreign appointment closes the Flow (427).
 */
import { z } from 'zod';

import type { AppointmentDTO } from '@booking/types';
import { addDays, dateOf, fullDate, timeOf, todayIn } from '../format.ts';
import { isCalendarDate, isInstant } from '../ids.ts';
import { timesFor } from './bookingFlow.ts';
import { FLOW_COPY, screen, type FlowRequest, type FlowResult, type Session } from './session.ts';

const Exchange = z.object({
  trigger: z.string().nullish(),
  date: z.string().nullish(),
  time: z.union([z.string(), z.array(z.string())]).nullish(),
});

export async function rescheduleFlow(s: Session, req: FlowRequest): Promise<FlowResult> {
  const appt = s.claims.appointmentId ? await s.deps.booking.getAppointment(s.business.id, s.claims.appointmentId) : null;
  if (!appt || appt.client_id !== s.client.id || appt.status !== 'confirmed' || Date.parse(appt.starts_at) <= s.now.getTime()) {
    return { status: 427 };
  }
  const parsed = Exchange.safeParse(req.data ?? {});
  if (req.action !== 'data_exchange' || !parsed.success) return dateTimeScreen(s, appt);
  const x = parsed.data;

  switch (x.trigger) {
    case 'date_selected':
      return x.date ? dateTimeScreen(s, appt, { date: x.date }) : dateTimeScreen(s, appt);
    case 'continue':
      return continueToSummary(s, appt, x);
    default:
      return dateTimeScreen(s, appt);
  }
}

async function continueToSummary(s: Session, appt: AppointmentDTO, x: z.infer<typeof Exchange>): Promise<FlowResult> {
  // ChipsSelector posts an array even with max-selected-items = 1.
  const raw = Array.isArray(x.time) ? x.time[0] : x.time;
  if (!raw || !isInstant(raw)) return dateTimeScreen(s, appt);

  const startsAt = new Date(raw).toISOString();
  const date = dateOf(startsAt, s.business.timezone);
  const chips = await timesFor(s, { id: appt.service_id }, date, appt.staff_id);
  if (!chips.some((c) => c.id === startsAt)) return dateTimeScreen(s, appt, { date, notice: FLOW_COPY.timeTaken });

  return screen('SUMMARY', {
    summary_text: await summaryMarkdown(s, appt, startsAt),
    appointment_id: appt.id,
    start_time_iso: startsAt,
    timezone: s.business.timezone,
  });
}

/**
 * DATETIME with the time grid hidden, or (with `date`) showing that day's
 * chips. `notice` replaces the date heading, since the Flow has no error slot.
 */
async function dateTimeScreen(s: Session, appt: AppointmentDTO, opts: { date?: string; notice?: string } = {}): Promise<FlowResult> {
  const tz = s.business.timezone;
  const min = todayIn(tz, s.now);
  const chips = opts.date ? await timesFor(s, { id: appt.service_id }, opts.date, appt.staff_id) : [];
  const hasTimes = chips.length > 0;
  return screen('DATETIME', {
    selected_service_label: (await serviceName(s, appt)).slice(0, 80),
    min_date: min,
    max_date: addDays(min, s.business.booking_rules.booking_horizon_days, tz),
    show_times: hasTimes,
    no_times: !!opts.date && !hasTimes,
    selected_date_label: opts.notice && hasTimes ? opts.notice : opts.date && isCalendarDate(opts.date) ? fullDate(opts.date, tz) : '',
    time: chips,
  });
}

async function serviceName(s: Session, appt: AppointmentDTO): Promise<string> {
  const services = await s.deps.booking.listServices(s.business.id, { activeOnly: false });
  return services.find((x) => x.id === appt.service_id)?.name ?? 'Appointment';
}

/** Markdown recap rendered by the SUMMARY `TextBody` (`markdown: true`). */
async function summaryMarkdown(s: Session, appt: AppointmentDTO, startsAt: string): Promise<string> {
  const tz = s.business.timezone;
  const when = (iso: string) => `${fullDate(dateOf(iso, tz), tz)} at ${timeOf(iso, tz)}`;
  return `**${await serviceName(s, appt)}**\n\n${fullDate(dateOf(startsAt, tz), tz)} at **${timeOf(startsAt, tz)}**\n\n_Now ${when(appt.starts_at)}_`;
}
