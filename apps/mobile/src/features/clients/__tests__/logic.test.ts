import {
  clientSearchFilter,
  clientStats,
  historyStatus,
  summariseVisits,
} from '../logic';

const TZ = 'Africa/Johannesburg';
// 2026-10-12 14:00 SAST
const NOW = new Date('2026-10-12T12:00:00.000Z');

describe('clientSearchFilter', () => {
  it.each([
    ['blank input', '   ', null],
    ['a plain name', 'olivia', 'name.ilike.*olivia*'],
    [
      'a name with filter syntax characters',
      'o,l(i)v*ia',
      'name.ilike.*o l i v ia*',
    ],
    [
      'a phone fragment',
      '082 123',
      'name.ilike.*082 123*,phone_e164.ilike.*082123*',
    ],
    ['two digits only (too short for a phone search)', '82', 'name.ilike.*82*'],
  ])('builds the filter for %s', (_label, input, expected) => {
    expect(clientSearchFilter(input)).toBe(expected);
  });
});

describe('summariseVisits', () => {
  it('reports the earliest non-cancelled appointment today', () => {
    const result = summariseVisits(
      [
        { starts_at: '2026-10-12T13:00:00.000Z', status: 'confirmed' },
        { starts_at: '2026-10-12T08:00:00.000Z', status: 'completed' },
        { starts_at: '2026-10-12T06:00:00.000Z', status: 'cancelled' },
      ],
      NOW,
      TZ,
    );
    expect(result.todayAt).toBe('2026-10-12T08:00:00.000Z');
  });

  it('uses the latest past visit as the last visit, ignoring no-shows and future bookings', () => {
    const result = summariseVisits(
      [
        { starts_at: '2026-10-20T08:00:00.000Z', status: 'confirmed' },
        { starts_at: '2026-10-10T08:00:00.000Z', status: 'no_show' },
        { starts_at: '2026-10-05T08:00:00.000Z', status: 'completed' },
        { starts_at: '2026-09-01T08:00:00.000Z', status: 'completed' },
      ],
      NOW,
      TZ,
    );
    expect(result).toEqual({ todayAt: null, lastVisitDate: '2026-10-05' });
  });

  it('places a late-evening UTC appointment on the next business day', () => {
    const result = summariseVisits(
      [{ starts_at: '2026-10-11T22:30:00.000Z', status: 'completed' }],
      NOW,
      TZ,
    );
    expect(result.todayAt).toBe('2026-10-11T22:30:00.000Z');
  });

  it('returns nothing for a client without appointments', () => {
    expect(summariseVisits([], NOW, TZ)).toEqual({
      todayAt: null,
      lastVisitDate: null,
    });
  });
});

describe('clientStats', () => {
  it('counts completed visits and spend, and the share of cancelled or no-show bookings', () => {
    expect(
      clientStats([
        { starts_at: 'x', status: 'completed', price_cents: 85000 },
        { starts_at: 'x', status: 'completed', price_cents: 55000 },
        { starts_at: 'x', status: 'cancelled', price_cents: 85000 },
        { starts_at: 'x', status: 'no_show', price_cents: 85000 },
        { starts_at: 'x', status: 'confirmed', price_cents: 85000 },
      ]),
    ).toEqual({
      visits: 2,
      spentCents: 140000,
      avgSpendCents: 70000,
      cancellationRate: 0.4,
    });
  });

  it('returns zeros for a client with no bookings', () => {
    expect(clientStats([])).toEqual({
      visits: 0,
      spentCents: 0,
      avgSpendCents: 0,
      cancellationRate: 0,
    });
  });
});

describe('historyStatus', () => {
  it.each([
    [
      'a future confirmed booking',
      { status: 'confirmed' as const, starts_at: '2026-10-13T08:00:00.000Z' },
      'upcoming',
    ],
    [
      'a past confirmed booking',
      { status: 'confirmed' as const, starts_at: '2026-10-11T08:00:00.000Z' },
      'confirmed',
    ],
    [
      'a future cancelled booking',
      { status: 'cancelled' as const, starts_at: '2026-10-13T08:00:00.000Z' },
      'cancelled',
    ],
  ])('labels %s', (_label, appointment, expected) => {
    expect(historyStatus(appointment, NOW)).toBe(expected);
  });
});
