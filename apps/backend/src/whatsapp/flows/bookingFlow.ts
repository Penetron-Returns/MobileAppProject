/**
 * Booking Flow data_exchange (SERVICE → DATETIME → SUMMARY), served for
 * `whatsapp/flows/booking.json`. Stateless: each request carries what it
 * needs, and every answer is re-derived from live availability through
 * BookingService. Nothing is written here. The terminal SUMMARY `complete`
 * action returns to the chat as an nfm_reply, and the conversation engine
 * books it (engine/transition.ts → `create_booking`).
 *
 * Triggers (payload `trigger`):
 *   service_selected  SERVICE  → DATETIME, time grid hidden
 *   date_selected     DATETIME → DATETIME, with that day's time chips
 *   continue          DATETIME → SUMMARY (slot re-validated), or DATETIME again when it vanished
 * Actions: INIT → SERVICE, BACK (DATETIME `refresh_on_back`) → fresh DATETIME.
 */
import { z } from 'zod';

import type { ServiceDTO } from '../../../../../packages/shared/api.ts';
import { addDays, dateOf, fullDate, priceLabel, timeOf, todayIn } from '../format.ts';
import { isCalendarDate, isInstant, isUuid } from '../ids.ts';
import { FLOW_COPY, screen, type FlowRequest, type FlowResult, type Session } from './session.ts';

/** RadioButtonsGroup and ChipsSelector render at most 20 options. */
export const MAX_FLOW_OPTIONS = 20;

const Exchange = z.object({
  trigger: z.string().nullish(),
  service: z.string().nullish(),
  service_slug: z.string().nullish(),
  date: z.string().nullish(),
  time: z.union([z.string(), z.array(z.string())]).nullish(),
});

export async function bookingFlow(s: Session, req: FlowRequest): Promise<FlowResult> {
  if (req.action === 'INIT') return serviceScreen(s);
  const parsed = Exchange.safeParse(req.data ?? {});
  if (!parsed.success) return serviceScreen(s);
  const x = parsed.data;

  if (req.action === 'BACK') {
    const svc = await findService(s, x.service_slug);
    return svc ? dateTimeScreen(s, svc) : serviceScreen(s);
  }
  if (req.action !== 'data_exchange') return serviceScreen(s);

  switch (x.trigger) {
    case 'service_selected': {
      const svc = await findService(s, x.service);
      return svc ? dateTimeScreen(s, svc) : serviceScreen(s);
    }
    case 'date_selected': {
      const svc = await findService(s, x.service);
      if (!svc) return serviceScreen(s);
      return x.date ? dateTimeScreen(s, svc, { date: x.date }) : dateTimeScreen(s, svc);
    }
    case 'continue':
      return continueToSummary(s, x);
    default:
      return serviceScreen(s);
  }
}

async function continueToSummary(s: Session, x: z.infer<typeof Exchange>): Promise<FlowResult> {
  const svc = await findService(s, x.service_slug);
  if (!svc) return serviceScreen(s);
  // ChipsSelector posts an array even with max-selected-items = 1.
  const raw = Array.isArray(x.time) ? x.time[0] : x.time;
  if (!raw || !isInstant(raw)) return dateTimeScreen(s, svc);

  const startsAt = new Date(raw).toISOString();
  const date = dateOf(startsAt, s.business.timezone);
  const chips = await timesFor(s, svc, date);
  if (!chips.some((c) => c.id === startsAt)) return dateTimeScreen(s, svc, { date, notice: FLOW_COPY.timeTaken });

  return screen('SUMMARY', {
    summary_text: summaryMarkdown(s, svc, startsAt),
    service_slug: svc.id,
    start_time_iso: startsAt,
    duration_minutes: svc.duration_minutes,
    timezone: s.business.timezone,
  });
}

// ---------------------------------------------------------------- screens

async function serviceScreen(s: Session): Promise<FlowResult> {
  const services = await s.deps.booking.listServices(s.business.id, { activeOnly: true });
  return screen('SERVICE', {
    service: services.slice(0, MAX_FLOW_OPTIONS).map((x) => ({
      id: x.id,
      title: x.name.slice(0, 30),
      description: `${x.duration_minutes} min`,
      ...(x.price_cents > 0 ? { metadata: priceLabel(x.price_cents, s.business.currency) } : {}),
    })),
  });
}

/**
 * DATETIME with the time grid hidden, or (with `date`) showing that day's
 * chips. `notice` replaces the date heading, since the Flow has no error slot.
 */
async function dateTimeScreen(s: Session, svc: ServiceDTO, opts: { date?: string; notice?: string } = {}): Promise<FlowResult> {
  const tz = s.business.timezone;
  const min = todayIn(tz, s.now);
  const chips = opts.date ? await timesFor(s, svc, opts.date) : [];
  const hasTimes = chips.length > 0;
  return screen('DATETIME', {
    service_slug: svc.id,
    selected_service_label: svc.name.slice(0, 80),
    min_date: min,
    max_date: addDays(min, s.business.booking_rules.booking_horizon_days, tz),
    show_times: hasTimes,
    no_times: !!opts.date && !hasTimes,
    selected_date_label: opts.notice && hasTimes ? opts.notice : opts.date && isCalendarDate(opts.date) ? fullDate(opts.date, tz) : '',
    time: chips,
    duration_minutes: svc.duration_minutes,
    timezone: tz,
  });
}

// ---------------------------------------------------------------- data

async function findService(s: Session, id: string | null | undefined): Promise<ServiceDTO | null> {
  if (!id || !isUuid(id)) return null;
  const services = await s.deps.booking.listServices(s.business.id, { activeOnly: true });
  return services.find((x) => x.id === id.toLowerCase()) ?? null;
}

/** Live bookable start times on a date (any staff member), inside the booking window only. */
export async function timesFor(
  s: Session,
  svc: Pick<ServiceDTO, 'id'>,
  date: string,
  staffId: string | null = null,
): Promise<{ id: string; title: string }[]> {
  if (!isCalendarDate(date)) return [];
  const tz = s.business.timezone;
  const min = todayIn(tz, s.now);
  if (date < min || date > addDays(min, s.business.booking_rules.booking_horizon_days, tz)) return [];
  const { slots } = await s.deps.booking.listAvailableSlots({ businessId: s.business.id, serviceId: svc.id, staffId, date, now: s.now });
  const seen = new Set<string>();
  const chips: { id: string; title: string }[] = [];
  for (const slot of slots) {
    const id = new Date(slot.starts_at).toISOString();
    if (seen.has(id)) continue;
    seen.add(id);
    chips.push({ id, title: timeOf(id, tz) });
  }
  return chips.slice(0, MAX_FLOW_OPTIONS);
}

/** Markdown recap rendered by the SUMMARY `TextBody` (`markdown: true`). */
function summaryMarkdown(s: Session, svc: ServiceDTO, startsAt: string): string {
  const tz = s.business.timezone;
  return `**${svc.name}**\n\n${fullDate(dateOf(startsAt, tz), tz)} at **${timeOf(startsAt, tz)}**\n\n_${svc.duration_minutes} min_`;
}
