import { describe, expect, it } from 'vitest';

import { computeFreeTime, type FreeTimeInput, type FreeTimeQuery } from '@booking/features/availability/lib/freeTime.ts';
import { computeSlots, type AvailabilityInput, type StaffSchedule, type WeeklyWindow } from '@booking/features/availability/lib/availability.ts';

const TZ = 'Africa/Johannesburg';
const WED = '2026-09-30';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

const weekdays = (start: string, end: string, days = [1, 2, 3, 4, 5]): WeeklyWindow[] => days.map((weekday) => ({ weekday, start, end }));
const staff = (id: string, extra: Partial<StaffSchedule> = {}): StaffSchedule => ({ id, sort_order: 0, rules: [], breaks: [], timeOff: [], ...extra });
const sast = (hhmm: string, date = WED) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();
const busy = (staff_id: string, from: string, to: string, date = WED) => ({ staff_id, start: sast(from, date), end: sast(to, date) });

function input(overrides: Partial<FreeTimeInput> = {}): FreeTimeInput {
  return { timezone: TZ, businessHours: weekdays('09:00', '17:00'), specialDays: [], overrides: [], staff: [staff(A)], busy: [], ...overrides };
}
const day = (overrides: Partial<FreeTimeQuery> = {}): FreeTimeQuery => ({ start: sast('00:00'), end: sast('23:59'), minimumMinutes: 15, ...overrides });
const hhmm = (iso: string) => new Date(Date.parse(iso) + 2 * 3_600_000).toISOString().slice(11, 16);
/** Windows of one staff member as SAST "HH:mm-HH:mm" pairs (single-day cases). */
const spans = (result: ReturnType<typeof computeFreeTime>, i = 0) => result[i]!.windows.map((w) => `${hhmm(w.starts_at)}-${hhmm(w.ends_at)}`);

describe('computeFreeTime', () => {
  it.each<[string, Partial<FreeTimeInput>, string[]]>([
    ['an empty day is the whole working day', {}, ['09:00-17:00']],
    ['a fully booked day has no windows', { busy: [busy(A, '09:00', '17:00')] }, []],
    ['back-to-back bookings leave only the gaps', { busy: [busy(A, '09:00', '10:00'), busy(A, '10:00', '11:00'), busy(A, '13:00', '14:00')] }, ['11:00-13:00', '14:00-17:00']],
    ['a break in the middle splits the day', { staff: [staff(A, { breaks: [{ weekdays: [], start: '12:00', end: '13:00' }] })] }, ['09:00-12:00', '13:00-17:00']],
    ['partial time off is removed', { staff: [staff(A, { timeOff: [{ starts_on: WED, ends_on: WED, start_time: '14:00', end_time: '16:00' }] })] }, ['09:00-14:00', '16:00-17:00']],
    ['all-day time off leaves nothing', { staff: [staff(A, { timeOff: [{ starts_on: WED, ends_on: WED, start_time: null, end_time: null }] })] }, []],
    ['a block (busy range) is removed', { busy: [busy(A, '11:30', '12:15')] }, ['09:00-11:30', '12:15-17:00']],
    ['a closed special day has no windows', { specialDays: [{ date: WED, is_closed: true, start_time: null, end_time: null }] }, []],
    ['a special day replaces the hours', { specialDays: [{ date: WED, is_closed: false, start_time: '10:00', end_time: '12:00' }] }, ['10:00-12:00']],
    ['a staff override is clipped to business hours', { overrides: [{ staff_id: A, date: WED, is_closed: false, start_time: '08:00', end_time: '10:00' }] }, ['09:00-10:00']],
    ['a closed staff override has no windows', { overrides: [{ staff_id: A, date: WED, is_closed: true, start_time: null, end_time: null }] }, []],
    ['staff hours are clipped to business hours', { staff: [staff(A, { rules: weekdays('07:00', '11:00') })] }, ['09:00-11:00']],
    ['a staff member with no hours on the weekday has no windows', { staff: [staff(A, { rules: weekdays('09:00', '12:00', [1]) })] }, []],
    ['overlapping bookings are merged', { busy: [busy(A, '10:00', '12:00'), busy(A, '11:00', '13:00')] }, ['09:00-10:00', '13:00-17:00']],
    ['another staff member\'s booking does not matter', { busy: [busy(B, '09:00', '17:00')] }, ['09:00-17:00']],
  ])('%s', (_name, overrides, expected) => {
    expect(spans(computeFreeTime(input(overrides), day()))).toEqual(expected);
  });

  it('keeps an entry with windows [] for a staff member without free time', () => {
    const result = computeFreeTime(input({ staff: [staff(A), staff(B, { rules: weekdays('09:00', '12:00', [0]) })] }), day());
    expect(result.map((r) => r.staff_id)).toEqual([A, B]);
    expect(result[1]!.windows).toEqual([]);
  });

  it('clips a booking that crosses the window edge and the window itself', () => {
    const i = input({ busy: [busy(A, '08:00', '10:00'), busy(A, '16:00', '18:00')] });
    expect(spans(computeFreeTime(i, day()))).toEqual(['10:00-16:00']);
    expect(spans(computeFreeTime(input(), day({ start: sast('10:30'), end: sast('12:00') })))).toEqual(['10:30-12:00']);
    // End is exclusive, start inclusive.
    expect(spans(computeFreeTime(input(), day({ start: sast('17:00'), end: sast('18:00') })))).toEqual([]);
    expect(spans(computeFreeTime(input(), day({ start: sast('08:00'), end: sast('09:00') })))).toEqual([]);
  });

  it('drops windows shorter than minimumMinutes', () => {
    const i = input({ busy: [busy(A, '09:10', '16:50')] });
    expect(spans(computeFreeTime(i, day({ minimumMinutes: 5 })))).toEqual(['09:00-09:10', '16:50-17:00']);
    expect(spans(computeFreeTime(i, day({ minimumMinutes: 10 })))).toEqual(['09:00-09:10', '16:50-17:00']);
    expect(spans(computeFreeTime(i, day({ minimumMinutes: 15 })))).toEqual([]);
  });

  it('joins windows that touch across midnight and spans several days', () => {
    const open24 = { businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '24:00' })) };
    const overnight = computeFreeTime(input(open24), { start: sast('20:00'), end: sast('06:00', '2026-10-01'), minimumMinutes: 15 });
    expect(overnight[0]!.windows).toEqual([{ starts_at: sast('20:00'), ends_at: sast('06:00', '2026-10-01') }]);

    const multi = computeFreeTime(input(), { start: sast('00:00'), end: sast('00:00', '2026-10-03'), minimumMinutes: 15 });
    expect(multi[0]!.windows).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'].map((d) => ({ starts_at: sast('09:00', d), ends_at: sast('17:00', d) })));
  });

  it('returns disjoint, sorted windows', () => {
    const i = input({ busy: [busy(A, '10:00', '10:30'), busy(A, '12:00', '12:30')], staff: [staff(A, { breaks: [{ weekdays: [], start: '14:00', end: '14:30' }] })] });
    const w = computeFreeTime(i, day())[0]!.windows.map((x) => [Date.parse(x.starts_at), Date.parse(x.ends_at)] as const);
    expect(w).toHaveLength(4);
    for (let k = 1; k < w.length; k++) expect(w[k]![0]).toBeGreaterThan(w[k - 1]![1]);
  });

  it('is empty for an empty or inverted query window', () => {
    expect(computeFreeTime(input(), day({ start: sast('10:00'), end: sast('10:00') }))[0]!.windows).toEqual([]);
    expect(computeFreeTime(input(), day({ start: sast('11:00'), end: sast('10:00') }))[0]!.windows).toEqual([]);
  });

  describe('DST (America/New_York)', () => {
    const NY = 'America/New_York';
    const sunday = (start: string, end: string) => ({ timezone: NY, businessHours: [{ weekday: 0, start, end }] });
    const win = (i: FreeTimeInput, start: string, end: string) => computeFreeTime(i, { start, end, minimumMinutes: 15 })[0]!.windows;

    it('spring forward: 01:00-05:00 local is three elapsed hours', () => {
      expect(win(input(sunday('01:00', '05:00')), '2026-03-08T00:00:00-05:00', '2026-03-09T00:00:00-04:00')).toEqual([
        { starts_at: '2026-03-08T06:00:00.000Z', ends_at: '2026-03-08T09:00:00.000Z' },
      ]);
    });

    it('fall back: 00:30-03:30 local is four elapsed hours and a booking subtracts by instant', () => {
      const i = input({ ...sunday('00:30', '03:30'), busy: [{ staff_id: A, start: '2026-11-01T05:30:00.000Z', end: '2026-11-01T06:30:00.000Z' }] });
      expect(win(i, '2026-11-01T00:00:00-04:00', '2026-11-02T00:00:00-05:00')).toEqual([
        { starts_at: '2026-11-01T04:30:00.000Z', ends_at: '2026-11-01T05:30:00.000Z' },
        { starts_at: '2026-11-01T06:30:00.000Z', ends_at: '2026-11-01T08:30:00.000Z' },
      ]);
    });
  });
});

describe('free time versus slots', () => {
  it.each([0, 15])('every slot lies inside a free window (buffer %i min)', (buffer) => {
    const base = input({
      busy: [busy(A, '10:00', '11:10'), busy(B, '09:30', '10:00')],
      staff: [
        staff(A, { breaks: [{ weekdays: [], start: '12:00', end: '12:45' }] }),
        staff(B, { timeOff: [{ starts_on: WED, ends_on: WED, start_time: '15:00', end_time: '16:00' }] }),
      ],
    });
    const slotInput: AvailabilityInput = {
      ...base,
      rules: { lead_time_minutes: 0, buffer_minutes: buffer, slot_interval_minutes: 15, booking_horizon_days: 365 },
      durationMinutes: 45,
      now: new Date('2026-09-28T06:00:00.000Z'),
    };
    const free = computeFreeTime(base, day({ minimumMinutes: 0 }));
    const slots = computeSlots(slotInput, WED);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      for (const id of slot.staff_ids) {
        const inside = free.find((f) => f.staff_id === id)!.windows.some((w) => w.starts_at <= slot.starts_at && slot.ends_at <= w.ends_at);
        expect(inside, `${id} ${slot.starts_at}`).toBe(true);
      }
    }
  });
});
