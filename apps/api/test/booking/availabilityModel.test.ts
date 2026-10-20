import { describe, expect, it } from 'vitest';

import {
  computeSlots,
  listAvailableDays,
  staffWindowsFor,
  subtractWindows,
  type AvailabilityInput,
  type BreakWindow,
  type OverrideWindow,
  type SpecialDayWindow,
  type StaffSchedule,
  type TimeOffWindow,
  type WeeklyWindow,
} from '@booking/features/availability/lib/availability.ts';

// Rule order under test: business hours → special day → staff hours → breaks → time off → slots.
// Monday 2026-09-28 08:00 SAST is "now"; the target day 2026-09-30 is a Wednesday (weekday 3).
const NOW = new Date('2026-09-28T06:00:00.000Z');
const WED = '2026-09-30';
const TZ = 'Africa/Johannesburg';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

const week = (start: string, end: string, days = [1, 2, 3, 4, 5]): WeeklyWindow[] => days.map((weekday) => ({ weekday, start, end }));
const lunch: BreakWindow = { weekdays: [], start: '12:00', end: '13:00' };
const off = (starts_on: string, ends_on: string, start_time: string | null = null, end_time: string | null = null): TimeOffWindow => ({
  starts_on, ends_on, start_time, end_time,
});
const closed = (date: string): SpecialDayWindow => ({ date, is_closed: true, start_time: null, end_time: null });
const hours = (date: string, start_time: string, end_time: string): SpecialDayWindow => ({ date, is_closed: false, start_time, end_time });

const staff = (id: string, extra: Partial<StaffSchedule> = {}): StaffSchedule => ({
  id, sort_order: 0, rules: [], breaks: [], timeOff: [], ...extra,
});

function input(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    rules: { lead_time_minutes: 0, buffer_minutes: 0, slot_interval_minutes: 60, booking_horizon_days: 60 },
    businessHours: week('09:00', '17:00'),
    specialDays: [],
    overrides: [],
    staff: [staff(A)],
    busy: [],
    durationMinutes: 60,
    now: NOW,
    ...over,
  };
}

/** SAST HH:mm of each slot start on `date`. */
const starts = (i: AvailabilityInput, date = WED) =>
  computeSlots(i, date).map((s) => new Date(Date.parse(s.starts_at) + 2 * 3_600_000).toISOString().slice(11, 16));

const ALL_DAY = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

describe('subtractWindows', () => {
  it.each([
    ['nothing removed', [[540, 600]], [], [[540, 600]]],
    ['middle', [[540, 1020]], [[720, 780]], [[540, 720], [780, 1020]]],
    ['start', [[540, 1020]], [[500, 600]], [[600, 1020]]],
    ['end', [[540, 1020]], [[960, 1100]], [[540, 960]]],
    ['everything', [[540, 1020]], [[0, 1440]], []],
    ['touching edges leave the window alone', [[540, 600]], [[600, 660]], [[540, 600]]],
    ['overlapping removals', [[540, 1020]], [[600, 700], [650, 800]], [[540, 600], [800, 1020]]],
    ['several windows', [[540, 600], [720, 900]], [[580, 740]], [[540, 580], [740, 900]]],
  ] as [string, [number, number][], [number, number][], [number, number][]][])('%s', (_name, a, remove, expected) => {
    expect(subtractWindows(a, remove)).toEqual(expected);
  });
});

describe('business hours and staff hours', () => {
  it.each([
    ['a staff member with no rules inherits the business hours', staff(A), ALL_DAY],
    ['staff hours wider than the business are clipped to it', staff(A, { rules: week('07:00', '20:00') }), ALL_DAY],
    ['staff hours narrower than the business apply', staff(A, { rules: week('10:00', '14:00') }), ['10:00', '11:00', '12:00', '13:00']],
    ['a weekday without a rule means off', staff(A, { rules: week('09:00', '17:00', [1, 2]) }), []],
  ])('%s', (_name, s, expected) => {
    expect(starts(input({ staff: [s] }))).toEqual(expected);
  });

  it('a closed weekday has no windows', () => {
    expect(starts(input({ businessHours: week('09:00', '17:00', [1, 2]) }))).toEqual([]);
  });
});

describe('special days', () => {
  it.each([
    ['a closed special day removes the whole date', [closed(WED)], []],
    ['special hours replace the weekday hours', [hours(WED, '10:00', '12:00')], ['10:00', '11:00']],
    ['special hours may be wider than the weekday hours', [hours(WED, '08:00', '18:00')], ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']],
    ['a special day on another date changes nothing', [closed('2026-10-01')], ALL_DAY],
  ])('%s', (_name, specialDays, expected) => {
    expect(starts(input({ specialDays }))).toEqual(expected);
  });

  it('special hours clip staff hours (staff are always inside the business window)', () => {
    const i = input({ specialDays: [hours(WED, '10:00', '12:00')], staff: [staff(A, { rules: week('09:00', '17:00') })] });
    expect(starts(i)).toEqual(['10:00', '11:00']);
  });

  it('special hours open a normally closed day for staff who inherit', () => {
    const sun = '2026-10-04';
    expect(starts(input({ specialDays: [hours(sun, '10:00', '12:00')] }), sun)).toEqual(['10:00', '11:00']);
  });

  it('a staff member with explicit hours stays off on a normally closed day even if it opens', () => {
    const sun = '2026-10-04';
    const i = input({ specialDays: [hours(sun, '10:00', '12:00')], staff: [staff(A, { rules: week('09:00', '17:00') })] });
    expect(starts(i, sun)).toEqual([]);
  });

  it('closed wins over hours when both exist for a date', () => {
    expect(starts(input({ specialDays: [hours(WED, '10:00', '12:00'), closed(WED)] }))).toEqual([]);
  });
});

describe('staff breaks', () => {
  it.each([
    ['a break in the middle', { weekdays: [], start: '12:00', end: '13:00' }, ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']],
    ['a break at the start of the day', { weekdays: [], start: '09:00', end: '10:00' }, ALL_DAY.slice(1)],
    ['a break at the end of the day', { weekdays: [], start: '16:00', end: '17:00' }, ALL_DAY.slice(0, 7)],
    ['a break only on matching weekdays (Wednesday = 3)', { weekdays: [3], start: '12:00', end: '13:00' }, ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']],
    ['a break on other weekdays does not apply', { weekdays: [1, 5], start: '12:00', end: '13:00' }, ALL_DAY],
    ['a break outside the working hours changes nothing', { weekdays: [], start: '18:00', end: '19:00' }, ALL_DAY],
  ] as [string, BreakWindow, string[]][])('%s', (_name, brk, expected) => {
    expect(starts(input({ staff: [staff(A, { breaks: [brk] })] }))).toEqual(expected);
  });

  it('re-aligns the slot grid to the start of the window after the break', () => {
    const i = input({ staff: [staff(A, { breaks: [{ weekdays: [], start: '12:30', end: '13:30' }] })] });
    expect(starts(i)).toEqual(['09:00', '10:00', '11:00', '13:30', '14:30', '15:30']);
  });

  it('a break that covers the whole day removes the day', () => {
    expect(starts(input({ staff: [staff(A, { breaks: [{ weekdays: [], start: '09:00', end: '17:00' }] })] }))).toEqual([]);
  });

  it('applies several breaks', () => {
    const breaks: BreakWindow[] = [lunch, { weekdays: [3], start: '15:00', end: '15:30' }];
    expect(starts(input({ staff: [staff(A, { breaks })] }))).toEqual(['09:00', '10:00', '11:00', '13:00', '14:00', '15:30']);
  });
});

describe('staff time off', () => {
  it.each([
    ['all-day, single date', off(WED, WED), []],
    ['multi-day range covering the date', off('2026-09-29', '2026-10-01'), []],
    ['multi-day range ending the day before', off('2026-09-28', '2026-09-29'), ALL_DAY],
    ['multi-day range starting the day after', off('2026-10-01', '2026-10-05'), ALL_DAY],
    ['range edges are inclusive', off(WED, '2026-10-02'), []],
    ['partial, single date', off(WED, WED, '14:00', '16:00'), ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00']],
    ['partial times apply on each date of a multi-day range', off('2026-09-29', '2026-10-01', '14:00', '16:00'), ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00']],
    ['partial at the start of the day', off(WED, WED, '00:00', '10:00'), ALL_DAY.slice(1)],
    ['partial running to midnight', off(WED, WED, '15:00', '24:00'), ALL_DAY.slice(0, 6)],
  ] as [string, TimeOffWindow, string[]][])('%s', (_name, timeOff, expected) => {
    expect(starts(input({ staff: [staff(A, { timeOff: [timeOff] })] }))).toEqual(expected);
  });

  it('time off removes only that staff member', () => {
    const i = input({ staff: [staff(A, { timeOff: [off(WED, WED)] }), staff(B, { sort_order: 1 })] });
    const slots = computeSlots(i, WED);
    expect(slots).toHaveLength(8);
    expect(slots.every((s) => s.staff_ids.join() === B)).toBe(true);
  });

  it('time off overlapping a break removes the union, not twice', () => {
    const i = input({ staff: [staff(A, { breaks: [lunch], timeOff: [off(WED, WED, '12:30', '14:00')] })] });
    expect(starts(i)).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']);
    expect(staffWindowsFor(i, i.staff[0]!, WED)).toEqual([[540, 720], [840, 1020]]);
  });

  it('a day where a break, time off and special hours remove everything has no slots or available day', () => {
    const i = input({
      specialDays: [hours(WED, '10:00', '12:00')],
      staff: [staff(A, { breaks: [{ weekdays: [], start: '10:00', end: '11:00' }], timeOff: [off(WED, WED, '11:00', '12:00')] })],
    });
    expect(computeSlots(i, WED)).toEqual([]);
    expect(listAvailableDays(i, WED, WED)).toEqual([]);
  });
});

describe('midnight boundaries', () => {
  const late = (over: Partial<AvailabilityInput> = {}) => input({ businessHours: week('22:00', '24:00'), ...over });

  it('business hours may close at 24:00', () => {
    expect(starts(late())).toEqual(['22:00', '23:00']);
  });
  it('a break ending at 24:00 trims the last window', () => {
    expect(starts(late({ staff: [staff(A, { breaks: [{ weekdays: [], start: '23:00', end: '24:00' }] })] }))).toEqual(['22:00']);
  });
  it('time off to 24:00 and a closed next day do not leak across midnight', () => {
    const i = late({ staff: [staff(A, { timeOff: [off(WED, WED, '22:30', '24:00')] })] });
    expect(starts(i)).toEqual([]);
    expect(starts(i, '2026-10-01')).toEqual(['22:00', '23:00']);
  });
  it('time off starting at 00:00 leaves the evening alone', () => {
    expect(starts(late({ staff: [staff(A, { timeOff: [off(WED, WED, '00:00', '22:00')] })] }))).toEqual(['22:00', '23:00']);
  });
  it('an early opening at 00:00 is cut by a break from 00:00', () => {
    const i = input({ businessHours: week('00:00', '03:00'), staff: [staff(A, { breaks: [{ weekdays: [], start: '00:00', end: '01:00' }] })] });
    expect(starts(i)).toEqual(['01:00', '02:00']);
  });
});

describe('per-staff overrides still apply', () => {
  const override = (o: Partial<OverrideWindow>): OverrideWindow => ({
    staff_id: A, date: WED, is_closed: false, start_time: '10:00', end_time: '15:00', ...o,
  });

  it('an override replaces the weekly hours, then breaks still apply', () => {
    const i = input({ overrides: [override({})], staff: [staff(A, { breaks: [lunch] })] });
    expect(starts(i)).toEqual(['10:00', '11:00', '13:00', '14:00']);
  });
  it('an override is still clipped by a closed special day', () => {
    expect(starts(input({ overrides: [override({})], specialDays: [closed(WED)] }))).toEqual([]);
  });
});

describe('"Any staff" resolution', () => {
  it('lists only the staff still free for a slot, in the unchanged tie-break order', () => {
    const i = input({
      staff: [staff(A, { sort_order: 0, breaks: [lunch] }), staff(B, { sort_order: 1 })],
      busy: [{ staff_id: A, start: '2026-09-30T07:00:00.000Z', end: '2026-09-30T08:00:00.000Z' }], // A busy 09-10
    });
    const slots = computeSlots(i, WED);
    const at = (h: string) => slots.find((s) => new Date(Date.parse(s.starts_at) + 2 * 3_600_000).toISOString().slice(11, 16) === h)!;
    expect(at('09:00').staff_ids).toEqual([B]); // A is busy
    expect(at('10:00').staff_ids).toEqual([B, A]); // both free: B has fewer appointments that day
    expect(at('12:00').staff_ids).toEqual([B]); // A on lunch
    expect(at('13:00').staff_ids).toEqual([B, A]);
  });
});
