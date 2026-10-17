import { describe, expect, it } from 'vitest';

import { buildBusinessStory, businessWindows, mostPopularService } from '@booking/features/stories/aggregators/business.ts';
import { TZ, daysAgo, fact, sastDate } from './fixtures.ts';

/** Monday 2026-10-19, 07:00 SAST */
const MONDAY = sastDate('2026-10-19T07:00');
const week = (appointments: ReturnType<typeof fact>[], now = MONDAY) =>
  buildBusinessStory({ now, timezone: TZ, currency: 'ZAR', span: 'week', appointments });
const at = (days: number, over: Partial<ReturnType<typeof fact>> = {}) => fact({ startsAt: daysAgo(days, MONDAY), ...over });
const card = (story: ReturnType<typeof week>, id: string) => story?.cards.find((c) => c.id === id);

describe('Business update', () => {
  it('is null when there is nothing in either period', () => {
    expect(week([])).toBeNull();
    expect(week([at(30)])).toBeNull();
    expect(week([at(2, { status: 'cancelled' })])).toBeNull();
  });

  describe('revenue against the previous week', () => {
    it.each([
      ['up 20%', 120000, 100000, 'positive', 'Up 20% on last week.', 20],
      ['up a little', 101000, 100000, 'positive', 'Up 1% on last week.', 1],
      ['flat', 100000, 100000, 'neutral', 'Up 0% on last week.', 0],
      ['down 10% (not more than 10)', 90000, 100000, 'neutral', 'Down 10% on last week.', -10],
      ['down 11%', 89000, 100000, 'attention', 'Down 11% on last week.', -11],
      ['down to nothing', 0, 100000, 'attention', 'Down 100% on last week.', -100],
    ])('%s', (_name, now, before, tone, body, pct) => {
      const list = [at(1, { priceCents: now }), at(9, { priceCents: before })].filter((a) => a.priceCents > 0);
      const c = card(week(list), 'business-revenue');
      expect(c).toMatchObject({ tone, body, number: { value: pct, format: 'percent', unit: 'vs last week' } });
    });

    it('shows the amount in rands from integer cents, in the headline', () => {
      expect(card(week([at(1, { priceCents: 245000 }), at(9, { priceCents: 100000 })]), 'business-revenue')?.headline).toBe('R2,450 booked this week');
    });

    it('with no previous revenue, shows the amount (cents, money) and is positive', () => {
      const c = card(week([at(1, { priceCents: 245000 })]), 'business-revenue');
      expect(c).toMatchObject({ tone: 'positive', number: { value: 245000, format: 'money' }, body: 'Nothing was booked last week, so there is no comparison yet.' });
    });

    it('does not count cancelled or no-show bookings as revenue', () => {
      const c = card(week([at(1, { priceCents: 50000 }), at(2, { priceCents: 70000, status: 'no_show' }), at(3, { priceCents: 90000, status: 'cancelled' }), at(9, { priceCents: 50000 })]), 'business-revenue');
      expect(c?.number?.value).toBe(0);
    });
  });

  describe('window boundaries', () => {
    it('is (now - 7d, now] against (now - 14d, now - 7d]', () => {
      const exactlySevenDays = at(7, { priceCents: 10000 });
      const justInside = at(6.99, { priceCents: 20000 });
      const atNow = fact({ startsAt: MONDAY.toISOString(), priceCents: 40000 });
      const c = card(week([exactlySevenDays, justInside, atNow]), 'business-revenue');
      // current = 20000 + 40000, previous = 10000 (the booking exactly 7 days ago belongs to the previous week)
      expect(c?.number).toMatchObject({ value: 500, format: 'percent' });
    });

    it('month-end compares the calendar month so far with the whole previous month, in the business zone', () => {
      const now = sastDate('2026-10-31T18:00');
      const { current, previous } = businessWindows(now, TZ, 'month');
      expect(new Date(current.from + 1).toISOString()).toBe(sastDate('2026-10-01T00:00').toISOString());
      expect(new Date(previous.from + 1).toISOString()).toBe(sastDate('2026-09-01T00:00').toISOString());
      const story = buildBusinessStory({
        now,
        timezone: TZ,
        currency: 'ZAR',
        span: 'month',
        appointments: [
          fact({ local: '2026-10-01T00:30', priceCents: 30000 }), // 22:30Z on 30 Sep, but October in SAST
          fact({ local: '2026-09-30T23:30', priceCents: 10000 }), // September
          fact({ local: '2026-09-10T10:00', priceCents: 10000 }),
        ],
      });
      expect(card(story, 'business-revenue')).toMatchObject({
        headline: 'R300 booked this month',
        body: 'Up 50% on last month.',
        number: { value: 50, format: 'percent', unit: 'vs last month' },
      });
    });
  });

  describe('no-shows', () => {
    it('are concern, with the first name, day and service, and make the whole story concern', () => {
      const story = week([
        at(1, { priceCents: 50000 }),
        at(2, { status: 'no_show', clientName: 'Sipho Zulu', serviceName: 'Fade' }),
      ]);
      expect(card(story, 'business-no-shows')).toMatchObject({
        tone: 'concern',
        headline: '1 no-show this week',
        list: [{ name: 'Sipho', initials: 'SZ', detail: 'Sat 17 Oct, Fade' }],
      });
      expect(story?.tone).toBe('concern');
      expect(card(story, 'business-no-shows')?.emotion).toBe('sympathetic');
    });

    it('are omitted at zero, and last week’s no-shows do not count', () => {
      expect(card(week([at(1, { priceCents: 50000 }), at(10, { status: 'no_show' })]), 'business-no-shows')).toBeUndefined();
    });
  });

  describe('most popular service', () => {
    it('picks the service with the most bookings in the current period', () => {
      const story = week([at(1, { serviceName: 'Braids' }), at(2, { serviceName: 'Fade' }), at(3, { serviceName: 'Fade' }), at(4, { serviceName: 'Fade', status: 'cancelled' }), at(9, { serviceName: 'Braids' }), at(10, { serviceName: 'Braids' })]);
      expect(card(story, 'business-popular')).toMatchObject({ headline: 'Fade was your most popular', body: '2 bookings this week.' });
    });

    it('breaks ties alphabetically', () => {
      expect(mostPopularService([fact({ serviceName: 'Fade' }), fact({ serviceName: 'Braids' })])).toEqual({ name: 'Braids', count: 1 });
      expect(mostPopularService([])).toBeNull();
    });
  });

  it('a positive week with one flat card is positive-leaning but never worse than its worst card', () => {
    const story = week([at(1, { priceCents: 150000 }), at(9, { priceCents: 100000 })]);
    expect(story?.cards.map((c) => c.id)).toEqual(['business-revenue', 'business-popular']);
    expect(story?.tone).toBe('neutral');
  });
});
