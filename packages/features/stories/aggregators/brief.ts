/**
 * Brief: today's bookings in the business timezone (docs/stories.md). Pure: `now` and the timezone are inputs.
 * Cards, in order, each only when it has content: today's count and first booking, the busiest 2-hour
 * window (needs at least 2 bookings), unconfirmed clients, revenue booked.
 */
import * as t from '../strings.ts';
import type { AppointmentFact, GeneratedStory, StoryCard } from '../types.ts';
import { firstName, formatMoney, hhmm, initialsOf, localDate, minutesOfDay, timeOf } from '../lib/format.ts';
import { overallTone, withEmotions } from '../lib/tone.ts';

export interface BriefInput {
  now: Date;
  timezone: string;
  currency: string;
  appointments: AppointmentFact[];
}

const WINDOW_MINUTES = 120;
const LIST_MAX = 3;

const byStart = (a: AppointmentFact, b: AppointmentFact) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);

/** The 2-hour block (anchored on a whole hour of a booking start) holding the most bookings; ties go to the earliest. */
export function busiestWindow(startMinutes: number[]): { from: number; count: number } | null {
  let best: { from: number; count: number } | null = null;
  for (const from of [...new Set(startMinutes.map((m) => Math.floor(m / 60) * 60))].sort((a, b) => a - b)) {
    const count = startMinutes.filter((m) => m >= from && m < from + WINDOW_MINUTES).length;
    if (!best || count > best.count) best = { from, count };
  }
  return best;
}

export function buildBrief({ now, timezone, currency, appointments }: BriefInput): GeneratedStory | null {
  const today = localDate(now.toISOString(), timezone);
  const active = appointments
    .filter((a) => a.status !== 'cancelled' && localDate(a.startsAt, timezone) === today)
    .sort(byStart);
  const first = active[0];
  if (!first) return null;

  const cards: StoryCard[] = [
    {
      id: 'brief-today',
      tone: 'neutral',
      kicker: t.KICKERS.today,
      headline: t.brief.bookings(active.length),
      body: t.brief.firstUp(timeOf(first.startsAt, timezone), firstName(first.clientName), first.serviceName),
      number: { value: active.length, format: 'count', unit: t.brief.bookingsUnit },
    },
  ];

  const busiest = busiestWindow(active.map((a) => minutesOfDay(a.startsAt, timezone)));
  if (busiest && busiest.count >= 2) {
    cards.push({
      id: 'brief-busiest',
      tone: 'neutral',
      kicker: t.KICKERS.busiest,
      headline: t.brief.busiest(hhmm(busiest.from), hhmm(busiest.from + WINDOW_MINUTES)),
      body: t.brief.busiestBody(busiest.count),
      number: { value: busiest.count, format: 'count', unit: t.brief.bookingsUnit },
    });
  }

  const unconfirmed = active.filter((a) => a.status === 'confirmed' && a.clientConfirmedAt === null);
  if (unconfirmed.length > 0) {
    cards.push({
      id: 'brief-unconfirmed',
      tone: 'attention',
      kicker: t.KICKERS.confirm,
      headline: t.brief.unconfirmed(unconfirmed.length),
      number: { value: unconfirmed.length, format: 'count' },
      list: unconfirmed.slice(0, LIST_MAX).map((a) => ({
        name: firstName(a.clientName),
        initials: initialsOf(a.clientName),
        detail: t.brief.unconfirmedItem(timeOf(a.startsAt, timezone), a.serviceName),
      })),
    });
  }

  const revenueCents = active.filter((a) => a.status !== 'no_show').reduce((sum, a) => sum + a.priceCents, 0);
  if (revenueCents > 0) {
    cards.push({
      id: 'brief-revenue',
      tone: 'positive',
      kicker: t.KICKERS.revenue,
      headline: t.brief.revenue(formatMoney(revenueCents, currency)),
      number: { value: revenueCents, format: 'money' },
    });
  }

  return { tone: overallTone(cards), cards: withEmotions(cards) };
}
