/**
 * Business update (docs/stories.md). Pure: `now` and the timezone are inputs.
 *
 * Weekly (Mondays): the last 7 days (now - 7d, now] against the 7 days before. Month-end: the calendar month so
 * far against the whole previous calendar month. Revenue counts confirmed and completed bookings by start time
 * (cancelled and no-show bookings earn nothing). Cards, only those with content: revenue and % change (positive
 * when up, attention when down more than 10%), no-shows (concern), the most popular service.
 */
import { DateTime } from 'luxon';

import * as t from '../strings.ts';
import type { AppointmentFact, GeneratedStory, StoryCard } from '../types.ts';
import { WEEK_MS, dayLabel, firstName, formatMoney, initialsOf } from '../lib/format.ts';
import { overallTone, withEmotions } from '../lib/tone.ts';

export type BusinessSpan = 'week' | 'month';
export const REVENUE_DROP_ATTENTION_PCT = 10;
const LIST_MAX = 3;

export interface BusinessInput {
  now: Date;
  timezone: string;
  currency: string;
  span: BusinessSpan;
  appointments: AppointmentFact[];
}

export interface Window {
  /** epoch ms, exclusive */
  from: number;
  /** epoch ms, inclusive */
  to: number;
}

/** Current and previous comparison windows (the repository loads previous.from .. current.to). */
export function businessWindows(now: Date, timezone: string, span: BusinessSpan): { current: Window; previous: Window } {
  const to = now.getTime();
  if (span === 'week') return { current: { from: to - WEEK_MS, to }, previous: { from: to - 2 * WEEK_MS, to: to - WEEK_MS } };
  const monthStart = DateTime.fromMillis(to, { zone: timezone }).startOf('month');
  const from = monthStart.toMillis() - 1;
  return { current: { from, to }, previous: { from: monthStart.minus({ months: 1 }).toMillis() - 1, to: from } };
}

const within = (a: AppointmentFact, w: Window) => {
  const start = Date.parse(a.startsAt);
  return start > w.from && start <= w.to;
};

const earns = (a: AppointmentFact) => a.status === 'confirmed' || a.status === 'completed';
const revenueOf = (list: AppointmentFact[]) => list.filter(earns).reduce((sum, a) => sum + a.priceCents, 0);

/** Most bookings wins; ties go to the alphabetically first name so the result is deterministic. */
export function mostPopularService(list: AppointmentFact[]): { name: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const a of list) counts.set(a.serviceName, (counts.get(a.serviceName) ?? 0) + 1);
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best ? { name: best[0], count: best[1] } : null;
}

export function buildBusinessStory({ now, timezone, currency, span, appointments }: BusinessInput): GeneratedStory | null {
  const { current, previous } = businessWindows(now, timezone, span);
  const mine = appointments.filter((a) => within(a, current));
  const before = appointments.filter((a) => within(a, previous));
  const cards: StoryCard[] = [];

  const revenue = revenueOf(mine);
  const revenueBefore = revenueOf(before);
  if (revenue > 0 || revenueBefore > 0) {
    const pct = revenueBefore > 0 ? Math.round(((revenue - revenueBefore) * 100) / revenueBefore) : null;
    cards.push({
      id: 'business-revenue',
      tone: pct === null || pct > 0 ? 'positive' : pct < -REVENUE_DROP_ATTENTION_PCT ? 'attention' : 'neutral',
      kicker: t.business.kicker(span),
      headline: t.business.revenueUp(formatMoney(revenue, currency), span),
      body: pct === null ? t.business.revenueFirst(span) : t.business.revenueBody(pct, span),
      number: pct === null ? { value: revenue, format: 'money' } : { value: pct, format: 'percent', unit: t.business.percentUnit(span) },
    });
  }

  const noShows = mine.filter((a) => a.status === 'no_show').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (noShows.length > 0) {
    cards.push({
      id: 'business-no-shows',
      tone: 'concern',
      kicker: t.KICKERS.noShows,
      headline: t.business.noShows(noShows.length, span),
      number: { value: noShows.length, format: 'count' },
      list: noShows.slice(0, LIST_MAX).map((a) => ({
        name: firstName(a.clientName),
        initials: initialsOf(a.clientName),
        detail: t.business.noShowDetail(dayLabel(a.startsAt, timezone), a.serviceName),
      })),
    });
  }

  const popular = mostPopularService(mine.filter((a) => a.status !== 'cancelled'));
  if (popular) {
    cards.push({
      id: 'business-popular',
      tone: 'neutral',
      kicker: t.KICKERS.popular,
      headline: t.business.popular(popular.name),
      body: t.business.popularBody(popular.count, span),
      number: { value: popular.count, format: 'count', unit: t.brief.bookingsUnit },
    });
  }

  return cards.length === 0 ? null : { tone: overallTone(cards), cards: withEmotions(cards) };
}
