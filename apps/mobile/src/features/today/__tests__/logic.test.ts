import {
  expectedTotalCents,
  formatDayCaption,
  needsConfirming,
  selectLaterToday,
  selectUpNext,
  todayWindow,
  upNextTiming,
  type TodayAppointment,
} from '../logic';

const TZ = 'Africa/Johannesburg'; // UTC+2, no DST

function appt(
  id: string,
  startsAt: string,
  overrides: Partial<TodayAppointment> = {},
): TodayAppointment {
  const start = new Date(startsAt);
  return {
    id,
    starts_at: startsAt,
    ends_at: new Date(start.getTime() + 60 * 60_000).toISOString(),
    duration_minutes: 60,
    status: 'confirmed',
    checked_in_at: null,
    price_cents: 10_000,
    client: { name: `Client ${id}`, phone_e164: '+27825550100' },
    service: { name: 'Silk press' },
    staff: { name: 'Thandi' },
    ...overrides,
  };
}

// 10:40 in Johannesburg on Wednesday 14 October 2026.
const NOW = new Date('2026-10-14T08:40:00.000Z');

describe('todayWindow', () => {
  it('spans the business-local day, not the UTC day', () => {
    const w = todayWindow(NOW, TZ);
    expect(w.date).toBe('2026-10-14');
    expect(w.from.toISOString()).toBe('2026-10-13T22:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-14T22:00:00.000Z');
  });

  it('is still the previous business day at 23:59 local', () => {
    const w = todayWindow(new Date('2026-10-14T21:59:00.000Z'), TZ);
    expect(w.date).toBe('2026-10-14');
  });

  it('rolls to the next business day at local midnight', () => {
    const w = todayWindow(new Date('2026-10-14T22:00:00.000Z'), TZ);
    expect(w.date).toBe('2026-10-15');
    expect(w.from.toISOString()).toBe('2026-10-14T22:00:00.000Z');
  });

  it('uses the business timezone when it is a day behind UTC', () => {
    // 03:00 UTC on 14 Oct is still 13 Oct evening in Los Angeles.
    const w = todayWindow(
      new Date('2026-10-14T03:00:00.000Z'),
      'America/Los_Angeles',
    );
    expect(w.date).toBe('2026-10-13');
  });

  it('is 23 hours long on a spring-forward day', () => {
    const w = todayWindow(
      new Date('2026-03-08T18:00:00.000Z'),
      'America/New_York',
    );
    expect(w.date).toBe('2026-03-08');
    expect((w.to.getTime() - w.from.getTime()) / 3_600_000).toBe(23);
  });

  it('is 25 hours long on a fall-back day', () => {
    const w = todayWindow(
      new Date('2026-11-01T18:00:00.000Z'),
      'America/New_York',
    );
    expect((w.to.getTime() - w.from.getTime()) / 3_600_000).toBe(25);
  });
});

describe('selectUpNext', () => {
  it('returns null for an empty day', () => {
    expect(selectUpNext([], NOW)).toBeNull();
  });

  it('picks the earliest booking that has not finished', () => {
    const list = [
      appt('c', '2026-10-14T11:00:00.000Z'),
      appt('b', '2026-10-14T09:00:00.000Z'),
      appt('a', '2026-10-14T06:00:00.000Z'), // finished at 07:00Z
    ];
    expect(selectUpNext(list, NOW)?.id).toBe('b');
  });

  it('keeps a booking that is under way as up next', () => {
    const list = [
      appt('a', '2026-10-14T08:00:00.000Z'),
      appt('b', '2026-10-14T09:00:00.000Z'),
    ];
    expect(selectUpNext(list, NOW)?.id).toBe('a');
  });

  it('keeps a checked-in booking as up next until it ends', () => {
    const list = [
      appt('a', '2026-10-14T08:30:00.000Z', {
        checked_in_at: '2026-10-14T08:25:00.000Z',
      }),
      appt('b', '2026-10-14T09:30:00.000Z'),
    ];
    expect(selectUpNext(list, NOW)?.id).toBe('a');
  });

  it('skips cancelled, completed and no-show bookings', () => {
    const list = [
      appt('a', '2026-10-14T09:00:00.000Z', { status: 'cancelled' }),
      appt('b', '2026-10-14T09:15:00.000Z', { status: 'no_show' }),
      appt('c', '2026-10-14T09:30:00.000Z', { status: 'completed' }),
      appt('d', '2026-10-14T10:00:00.000Z'),
    ];
    expect(selectUpNext(list, NOW)?.id).toBe('d');
  });

  it('breaks start-time ties by id so the choice is stable', () => {
    const list = [
      appt('b', '2026-10-14T09:00:00.000Z'),
      appt('a', '2026-10-14T09:00:00.000Z'),
    ];
    expect(selectUpNext(list, NOW)?.id).toBe('a');
  });

  it('is null once everything has finished', () => {
    expect(
      selectUpNext([appt('a', '2026-10-14T06:00:00.000Z')], NOW),
    ).toBeNull();
  });
});

describe('selectLaterToday', () => {
  const later = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      appt(`x${i}`, `2026-10-14T${String(9 + i).padStart(2, '0')}:00:00.000Z`),
    );

  it('excludes the up-next booking and orders by start time', () => {
    const { rows } = selectLaterToday([...later(3)].reverse(), NOW);
    expect(rows.map((r) => r.id)).toEqual(['x1', 'x2']);
  });

  it('caps the list and counts the rest', () => {
    const result = selectLaterToday(later(8), NOW, 4);
    expect(result.rows).toHaveLength(4);
    expect(result.hiddenCount).toBe(3);
  });

  it('has no hidden rows when everything fits', () => {
    expect(selectLaterToday(later(3), NOW).hiddenCount).toBe(0);
  });

  it('is empty when only the up-next booking remains', () => {
    expect(selectLaterToday(later(1), NOW)).toEqual({
      rows: [],
      hiddenCount: 0,
    });
  });

  it('is empty for an empty day', () => {
    expect(selectLaterToday([], NOW)).toEqual({ rows: [], hiddenCount: 0 });
  });
});

describe('expectedTotalCents', () => {
  it('is zero for an empty day', () => {
    expect(expectedTotalCents([])).toBe(0);
  });

  it('counts confirmed and completed bookings only', () => {
    const list = [
      appt('a', '2026-10-14T07:00:00.000Z', {
        status: 'completed',
        price_cents: 45_000,
      }),
      appt('b', '2026-10-14T09:00:00.000Z', { price_cents: 30_000 }),
      appt('c', '2026-10-14T10:00:00.000Z', {
        status: 'cancelled',
        price_cents: 99_900,
      }),
      appt('d', '2026-10-14T11:00:00.000Z', {
        status: 'no_show',
        price_cents: 12_300,
      }),
    ];
    expect(expectedTotalCents(list)).toBe(75_000);
  });
});

describe('needsConfirming', () => {
  it('is false for every status the schema currently has', () => {
    for (const status of [
      'confirmed',
      'completed',
      'cancelled',
      'no_show',
    ] as const) {
      expect(needsConfirming({ status })).toBe(false);
    }
  });

  it('is true for a pending booking', () => {
    expect(needsConfirming({ status: 'pending' as never })).toBe(true);
  });
});

describe('upNextTiming', () => {
  it('reports arrived once checked in', () => {
    const a = appt('a', '2026-10-14T09:00:00.000Z', {
      checked_in_at: '2026-10-14T08:55:00.000Z',
    });
    expect(upNextTiming(a, NOW)).toEqual({ kind: 'arrived' });
  });

  it('counts whole minutes until the start, rounding up', () => {
    const a = appt('a', '2026-10-14T09:00:30.000Z');
    expect(upNextTiming(a, NOW)).toEqual({ kind: 'in', minutes: 21 });
  });

  it('says now when the booking has started', () => {
    expect(upNextTiming(appt('a', '2026-10-14T08:40:00.000Z'), NOW)).toEqual({
      kind: 'now',
    });
    expect(upNextTiming(appt('a', '2026-10-14T08:10:00.000Z'), NOW)).toEqual({
      kind: 'now',
    });
  });
});

describe('formatDayCaption', () => {
  it('formats weekday, day and month', () => {
    expect(formatDayCaption('2026-10-14')).toBe('Wednesday 14 October');
    expect(formatDayCaption('2026-01-01')).toBe('Thursday 1 January');
  });
});
