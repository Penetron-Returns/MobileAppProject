import { describe, expect, it } from 'vitest';

import { buildBrief, busiestWindow } from '@booking/features/stories/aggregators/brief.ts';
import { formatMoney } from '@booking/features/stories/lib/format.ts';
import { emotionFor, overallTone } from '@booking/features/stories/lib/tone.ts';
import { NOW, TZ, fact, sastDate } from './fixtures.ts';

const brief = (appointments: ReturnType<typeof fact>[], now = NOW) => buildBrief({ now, timezone: TZ, currency: 'ZAR', appointments });
const card = (story: ReturnType<typeof brief>, id: string) => story?.cards.find((c) => c.id === id);

describe('Brief', () => {
  it.each([
    ['no appointments', []],
    ['only cancelled bookings', [fact({ status: 'cancelled' })]],
    ['bookings on other days', [fact({ local: '2026-10-16T09:00' }), fact({ local: '2026-10-18T09:00' })]],
  ])('is null for %s', (_name, appointments) => {
    expect(brief(appointments)).toBeNull();
  });

  it('opens with the count and the first booking time, client first name and service', () => {
    const story = brief([
      fact({ local: '2026-10-17T11:00', clientName: 'Lerato Dube', serviceName: 'Braids' }),
      fact({ local: '2026-10-17T09:00', clientName: 'Thandi Nkosi', serviceName: 'Silk press' }),
      fact({ local: '2026-10-17T14:00' }),
    ]);
    expect(story?.cards[0]).toMatchObject({
      id: 'brief-today',
      headline: '3 bookings today',
      body: 'First up: Thandi at 09:00, Silk press.',
      number: { value: 3, format: 'count', unit: 'bookings' },
    });
  });

  it('uses the singular for one booking and a fallback when the client has no name', () => {
    const story = brief([fact({ clientName: null })]);
    expect(story?.cards[0]).toMatchObject({ headline: '1 booking today', body: 'First up: A client at 09:00, Silk press.' });
  });

  describe('busiest window', () => {
    it.each([
      ['two in the same two hours', [600, 630], { from: 600, count: 2 }],
      ['the block with the most bookings', [540, 660, 690, 700, 840], { from: 660, count: 3 }],
      ['ties go to the earliest block', [540, 560, 840, 860], { from: 540, count: 2 }],
      ['a single booking', [600], { from: 600, count: 1 }],
      ['nothing', [], null],
    ])('%s', (_name, starts, expected) => {
      expect(busiestWindow(starts)).toEqual(expected);
    });

    it('shows "Busiest 10:00–12:00" with the count', () => {
      const story = brief([fact({ local: '2026-10-17T10:00' }), fact({ local: '2026-10-17T10:30' }), fact({ local: '2026-10-17T11:45' }), fact({ local: '2026-10-17T15:00' })]);
      expect(card(story, 'brief-busiest')).toMatchObject({ headline: 'Busiest 10:00–12:00', body: '3 bookings in that window.' });
    });

    it('is omitted when there is only one booking', () => {
      expect(card(brief([fact()]), 'brief-busiest')).toBeUndefined();
    });
  });

  describe('unconfirmed clients', () => {
    it('lists confirmed bookings without client_confirmed_at, with first name, time and service, as attention', () => {
      const story = brief([
        fact({ local: '2026-10-17T09:00', clientName: 'Thandi Nkosi', serviceName: 'Silk press' }),
        fact({ local: '2026-10-17T10:00', clientName: 'Aisha Patel', serviceName: 'Braids', clientConfirmedAt: '2026-10-16T08:00:00.000Z' }),
        fact({ local: '2026-10-17T11:00', clientName: 'Sipho Zulu', serviceName: 'Fade', status: 'completed' }),
        fact({ local: '2026-10-17T12:00', clientName: 'Lerato Dube', serviceName: 'Gel overlay' }),
      ]);
      expect(card(story, 'brief-unconfirmed')).toMatchObject({
        tone: 'attention',
        headline: '2 clients haven’t confirmed',
        number: { value: 2, format: 'count' },
        list: [
          { name: 'Thandi', initials: 'TN', detail: '09:00, Silk press' },
          { name: 'Lerato', initials: 'LD', detail: '12:00, Gel overlay' },
        ],
      });
      expect(story?.tone).toBe('attention');
    });

    it('caps the list at three but keeps the full count', () => {
      const many = ['A', 'B', 'C', 'D', 'E'].map((n, i) => fact({ local: `2026-10-17T1${i}:00`, clientName: `${n} Person` }));
      const c = card(brief(many), 'brief-unconfirmed');
      expect(c?.number?.value).toBe(5);
      expect(c?.list).toHaveLength(3);
    });

    it('is omitted when everyone confirmed, and the story is then not attention', () => {
      const story = brief([fact({ clientConfirmedAt: '2026-10-16T08:00:00.000Z' }), fact({ local: '2026-10-17T13:00', clientConfirmedAt: '2026-10-16T08:00:00.000Z' })]);
      expect(card(story, 'brief-unconfirmed')).toBeUndefined();
      expect(story?.tone).toBe('neutral');
    });
  });

  describe('revenue', () => {
    it('sums the service prices in integer cents and formats them as rands', () => {
      const story = brief([fact({ priceCents: 120000 }), fact({ local: '2026-10-17T11:00', priceCents: 125000 })]);
      expect(card(story, 'brief-revenue')).toMatchObject({ tone: 'positive', headline: 'R2,450 booked today', number: { value: 245000, format: 'money' } });
    });

    it('ignores cancelled and no-show bookings, and is omitted when everything is free', () => {
      const story = brief([fact({ priceCents: 10000 }), fact({ priceCents: 99900, status: 'no_show' }), fact({ priceCents: 99900, status: 'cancelled' })]);
      expect(card(story, 'brief-revenue')?.number?.value).toBe(10000);
      expect(card(brief([fact({ priceCents: 0 })]), 'brief-revenue')).toBeUndefined();
    });
  });

  describe('business-timezone day boundaries', () => {
    it('counts 00:30 SAST on the 17th (22:30Z on the 16th) as today and 00:00 SAST on the 18th as tomorrow', () => {
      const story = brief([
        fact({ startsAt: '2026-10-16T22:30:00.000Z', clientName: 'Night Owl' }),
        fact({ startsAt: '2026-10-17T21:59:00.000Z', clientName: 'Late Bird' }),
        fact({ startsAt: '2026-10-17T22:00:00.000Z', clientName: 'Tomorrow' }),
        fact({ startsAt: '2026-10-16T21:59:00.000Z', clientName: 'Yesterday' }),
      ]);
      expect(story?.cards[0]?.number?.value).toBe(2);
    });

    it('uses the day of `now` in the business zone, not in UTC', () => {
      // 01:30 SAST on the 17th is 23:30Z on the 16th: still the 17th in the business zone
      const story = brief([fact({ local: '2026-10-17T09:00' })], sastDate('2026-10-17T01:30'));
      expect(story?.cards[0]?.number?.value).toBe(1);
    });

    it('uses the zone offset in force on that day (London, clocks go forward at 01:00 UTC on 2026-03-29)', () => {
      const story = buildBrief({
        now: new Date('2026-03-29T08:00:00.000Z'),
        timezone: 'Europe/London',
        currency: 'GBP',
        appointments: [fact({ startsAt: '2026-03-29T00:30:00.000Z' }), fact({ startsAt: '2026-03-28T23:30:00.000Z' })],
      });
      expect(story?.cards[0]?.headline).toBe('1 booking today');
      expect(story?.cards[0]?.body).toContain('at 00:30');
    });
  });

  it('gives every card an emotion that matches its tone', () => {
    const story = brief([fact(), fact({ local: '2026-10-17T10:00' })]);
    for (const c of story!.cards) expect(c.emotion).toBe(emotionFor(c.tone, story!.cards.indexOf(c)));
    expect(card(story, 'brief-unconfirmed')?.emotion).toBe('thoughtful');
    expect(card(story, 'brief-today')?.emotion).toBe('curious');
  });
});

describe('story tone', () => {
  it.each([
    [[], 'neutral'],
    [['positive'], 'positive'],
    [['neutral', 'positive'], 'neutral'],
    [['neutral', 'attention'], 'attention'],
    [['positive', 'positive', 'attention'], 'neutral'],
    [['positive', 'attention'], 'attention'],
    [['positive', 'positive', 'positive', 'concern'], 'concern'],
    [['attention', 'concern', 'neutral'], 'concern'],
  ] as const)('%j is %s', (tones, expected) => {
    expect(overallTone(tones.map((tone) => ({ tone })))).toBe(expected);
  });

  it.each([
    ['positive', 0, 'proud'],
    ['positive', 1, 'delighted'],
    ['neutral', 0, 'curious'],
    ['attention', 0, 'thoughtful'],
    ['concern', 0, 'sympathetic'],
  ] as const)('%s card %i is %s', (tone, index, emotion) => {
    expect(emotionFor(tone, index)).toBe(emotion);
  });
});

describe('formatMoney', () => {
  it.each([
    [245000, 'ZAR', 'R2,450'],
    [245050, 'ZAR', 'R2,450.50'],
    [0, 'ZAR', 'R0'],
    [99, 'ZAR', 'R0.99'],
    [123456789, 'ZAR', 'R1,234,567.89'],
    [1000, 'USD', '$10'],
    [1000, 'CHF', 'CHF 10'],
    [-5000, 'ZAR', '-R50'],
  ])('%i %s -> %s', (cents, currency, expected) => {
    expect(formatMoney(cents, currency)).toBe(expected);
  });
});
