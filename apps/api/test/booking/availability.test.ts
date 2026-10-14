import { describe, expect, it } from 'vitest';

import {
  bookableDateRange,
  computeSlots,
  findSlot,
  freeStaffIgnoringHours,
  intersectWindows,
  listAvailableDays,
  mergeWindows,
  type AvailabilityInput,
  type StaffSchedule,
  type WeeklyWindow,
} from '@booking/features/availability/lib/availability.ts';

// Monday 2026-09-28 08:00 SAST. The target day 2026-09-30 is a Wednesday (weekday 3).
const NOW = new Date('2026-09-28T06:00:00.000Z');
const WED = '2026-09-30';
const TZ = 'Africa/Johannesburg';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

const weekdays = (start: string, end: string, days = [1, 2, 3, 4, 5]): WeeklyWindow[] =>
  days.map((weekday) => ({ weekday, start, end }));

const staff = (id: string, sort_order = 0, rules: WeeklyWindow[] = []): StaffSchedule => ({ id, sort_order, rules });

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    rules: { lead_time_minutes: 0, buffer_minutes: 0, slot_interval_minutes: 30, booking_horizon_days: 60 },
    businessHours: weekdays('09:00', '12:00'),
    overrides: [],
    staff: [staff(A)],
    busy: [],
    durationMinutes: 60,
    now: NOW,
    ...overrides,
  };
}

/** SAST wall-clock HH:mm of each slot start. */
const starts = (i: AvailabilityInput, date = WED) =>
  computeSlots(i, date).map((s) => {
    const d = new Date(Date.parse(s.starts_at) + 2 * 3_600_000);
    return d.toISOString().slice(11, 16);
  });

/** ISO instant for SAST wall-clock on WED. */
const sast = (hhmm: string, date = WED) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();

const rules = (r: Partial<AvailabilityInput['rules']>) => ({ ...input().rules, ...r });

describe('window algebra', () => {
  it('merges overlapping and touching windows', () => {
    expect(mergeWindows([[600, 700], [540, 600], [650, 720], [800, 900]])).toEqual([[540, 720], [800, 900]]);
  });
  it('intersects window sets', () => {
    expect(intersectWindows([[540, 720], [780, 1020]], [[600, 840]])).toEqual([[600, 720], [780, 840]]);
    expect(intersectWindows([[540, 600]], [[600, 660]])).toEqual([]);
  });
});

describe('computeSlots', () => {
  it('steps from the window start by the interval and fits the whole service', () => {
    const slots = computeSlots(input(), WED);
    expect(slots.map((s) => s.starts_at)).toEqual([
      '2026-09-30T07:00:00.000Z',
      '2026-09-30T07:30:00.000Z',
      '2026-09-30T08:00:00.000Z',
      '2026-09-30T08:30:00.000Z',
      '2026-09-30T09:00:00.000Z',
    ]);
    expect(slots[0]).toEqual({ starts_at: sast('09:00'), ends_at: sast('10:00'), staff_ids: [A] });
  });

  it('aligns to the window start, not the clock', () => {
    const i = input({ businessHours: weekdays('09:10', '11:00'), durationMinutes: 30, rules: rules({ slot_interval_minutes: 15 }) });
    expect(starts(i)).toEqual(['09:10', '09:25', '09:40', '09:55', '10:10', '10:25']);
  });

  it('handles split shifts (lunch break)', () => {
    const i = input({
      businessHours: [...weekdays('09:00', '12:00'), ...weekdays('13:00', '17:00')],
      rules: rules({ slot_interval_minutes: 60 }),
    });
    expect(starts(i)).toEqual(['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('treats touching rule rows as one continuous window', () => {
    const i = input({ businessHours: [...weekdays('09:00', '10:30'), ...weekdays('10:30', '12:00')], durationMinutes: 90 });
    expect(starts(i)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('returns nothing when the service is longer than every window', () => {
    expect(computeSlots(input({ businessHours: weekdays('09:00', '10:00'), durationMinutes: 90 }), WED)).toEqual([]);
  });

  it('returns nothing on a closed weekday or with no staff', () => {
    expect(computeSlots(input(), '2026-09-27')).toEqual([]); // Sunday
    expect(computeSlots(input({ staff: [] }), WED)).toEqual([]);
    expect(computeSlots(input({ businessHours: [] }), WED)).toEqual([]);
    expect(computeSlots(input({ durationMinutes: 0 }), WED)).toEqual([]);
  });

  it('supports closing at midnight (24:00)', () => {
    const i = input({ businessHours: weekdays('22:00', '24:00'), rules: rules({ slot_interval_minutes: 60 }) });
    expect(computeSlots(i, WED).map((s) => s.ends_at)).toEqual([sast('23:00'), '2026-09-30T22:00:00.000Z']);
  });

  describe('busy ranges', () => {
    it('removes slots that overlap an existing appointment', () => {
      const i = input({ busy: [{ staff_id: A, start: sast('10:00'), end: sast('11:00') }] });
      expect(starts(i)).toEqual(['09:00', '11:00']);
    });

    it('applies the buffer after the new appointment', () => {
      const busy = [{ staff_id: A, start: sast('10:00'), end: sast('11:00') }];
      const i = input({ busy, rules: rules({ buffer_minutes: 15 }) });
      // 09:00 would block until 10:15 and clash; 11:00 needs 11:00-12:15 which only has to fit the service
      expect(starts(i)).toEqual(['11:00']);
    });

    it('handles overlapping busy ranges', () => {
      const i = input({
        businessHours: weekdays('09:00', '13:00'),
        busy: [
          { staff_id: A, start: sast('09:30'), end: sast('10:30') },
          { staff_id: A, start: sast('10:00'), end: sast('11:30') },
        ],
      });
      expect(starts(i)).toEqual(['11:30', '12:00']);
    });

    it('treats a busy range ending exactly at the slot start as free (half-open)', () => {
      const i = input({ busy: [{ staff_id: A, start: sast('08:00'), end: sast('09:00') }] });
      expect(starts(i)[0]).toBe('09:00');
    });

    it("ignores other staff's appointments", () => {
      const i = input({ busy: [{ staff_id: B, start: sast('09:00'), end: sast('12:00') }] });
      expect(starts(i)).toHaveLength(5);
    });
  });

  describe('lead time and horizon', () => {
    it('enforces the lead time from now', () => {
      const i = input({ now: new Date(sast('09:10')), rules: rules({ lead_time_minutes: 60 }) });
      expect(starts(i)).toEqual(['10:30', '11:00']);
    });

    it('allows a slot exactly at now + lead', () => {
      const i = input({ now: new Date(sast('08:00')), rules: rules({ lead_time_minutes: 60 }) });
      expect(starts(i)[0]).toBe('09:00');
    });

    it('never offers past dates', () => {
      expect(computeSlots(input(), '2026-09-25')).toEqual([]);
    });

    it('stops at today + booking_horizon_days', () => {
      const i = input({ rules: rules({ booking_horizon_days: 2 }) });
      expect(bookableDateRange(i)).toEqual({ first: '2026-09-28', last: WED });
      expect(computeSlots(i, WED)).toHaveLength(5);
      expect(computeSlots(i, '2026-10-01')).toEqual([]);
      expect(bookableDateRange(input({ rules: rules({ booking_horizon_days: 0 }) }))).toEqual({
        first: '2026-09-28',
        last: '2026-09-28',
      });
    });

    it('uses the business timezone for "today"', () => {
      // 23:30Z on the 27th is already the 28th in Johannesburg
      const i = input({ now: new Date('2026-09-27T23:30:00Z'), rules: rules({ booking_horizon_days: 0 }) });
      expect(bookableDateRange(i).first).toBe('2026-09-28');
    });
  });

  describe('overrides', () => {
    it('business-wide closure removes the day', () => {
      const i = input({ overrides: [{ staff_id: null, date: WED, is_closed: true, start_time: null, end_time: null }] });
      expect(computeSlots(i, WED)).toEqual([]);
      expect(computeSlots(i, '2026-10-01')).toHaveLength(5);
    });

    it('business-wide custom window replaces business hours for that date', () => {
      const i = input({ overrides: [{ staff_id: null, date: WED, is_closed: false, start_time: '10:00:00', end_time: '11:00:00' }] });
      expect(starts(i)).toEqual(['10:00']);
    });

    it('business-wide override can open a normally closed day', () => {
      const sun = '2026-10-04';
      const i = input({ overrides: [{ staff_id: null, date: sun, is_closed: false, start_time: '10:00', end_time: '12:00' }] });
      expect(starts(i, sun)).toEqual(['10:00', '10:30', '11:00']);
    });

    it('staff closure removes only that staff member', () => {
      const i = input({
        staff: [staff(A), staff(B)],
        overrides: [{ staff_id: A, date: WED, is_closed: true, start_time: null, end_time: null }],
      });
      expect(computeSlots(i, WED).every((s) => s.staff_ids.join() === B)).toBe(true);
    });

    it('staff custom window replaces their rules but stays inside business hours', () => {
      const i = input({
        businessHours: weekdays('09:00', '17:00'),
        staff: [staff(A, 0, weekdays('09:00', '12:00'))],
        overrides: [{ staff_id: A, date: WED, is_closed: false, start_time: '15:00', end_time: '19:00' }],
        rules: rules({ slot_interval_minutes: 60 }),
      });
      expect(starts(i)).toEqual(['15:00', '16:00']);
    });

    it('closure wins over a window on the same date', () => {
      const i = input({
        overrides: [
          { staff_id: A, date: WED, is_closed: false, start_time: '09:00', end_time: '12:00' },
          { staff_id: A, date: WED, is_closed: true, start_time: null, end_time: null },
        ],
      });
      expect(computeSlots(i, WED)).toEqual([]);
    });
  });

  describe('staff rules', () => {
    it('staff with zero rules inherit business hours; others are clipped to them', () => {
      const i = input({
        businessHours: weekdays('09:00', '17:00'),
        staff: [staff(A, 0, weekdays('07:00', '10:00')), staff(B, 1)],
        rules: rules({ slot_interval_minutes: 60 }),
      });
      const slots = computeSlots(i, WED);
      expect(slots[0]).toMatchObject({ starts_at: sast('09:00'), staff_ids: [A, B] });
      expect(slots.slice(1).every((s) => s.staff_ids.join() === B)).toBe(true);
      expect(slots).toHaveLength(8);
    });

    it('a staff member with rules on other weekdays only is unavailable', () => {
      const i = input({ staff: [staff(A, 0, weekdays('09:00', '12:00', [1]))] });
      expect(computeSlots(i, WED)).toEqual([]);
    });
  });

  describe('multiple staff', () => {
    it('merges slots and orders staff by appointments that day, then sort_order, then id', () => {
      const i = input({
        businessHours: weekdays('09:00', '17:00'),
        staff: [staff(A, 2), staff(B, 1), staff(C, 1)],
        busy: [{ staff_id: B, start: sast('15:00'), end: sast('16:00') }],
        rules: rules({ slot_interval_minutes: 60 }),
      });
      const slots = computeSlots(i, WED);
      expect(slots[0]!.staff_ids).toEqual([C, A, B]);
      expect(slots.find((s) => s.starts_at === sast('15:00'))!.staff_ids).toEqual([C, A]);
    });

    it('breaks sort_order ties by id', () => {
      const i = input({ staff: [staff(C, 0), staff(B, 0), staff(A, 0)] });
      expect(computeSlots(i, WED)[0]!.staff_ids).toEqual([A, B, C]);
    });

    it('only counts appointments on the same date for the tie-break', () => {
      const i = input({
        staff: [staff(A, 0), staff(B, 1)],
        busy: [{ staff_id: A, start: sast('10:00', '2026-10-01'), end: sast('11:00', '2026-10-01') }],
      });
      expect(computeSlots(i, WED)[0]!.staff_ids).toEqual([A, B]);
      expect(computeSlots(i, '2026-10-01')[0]!.staff_ids).toEqual([B, A]);
    });

    it('is deterministic regardless of input order', () => {
      const base = input({ staff: [staff(A, 1), staff(B, 0), staff(C, 1)], businessHours: weekdays('09:00', '17:00') });
      const shuffled = { ...base, staff: [base.staff[2]!, base.staff[0]!, base.staff[1]!] };
      expect(computeSlots(shuffled, WED)).toEqual(computeSlots(base, WED));
      expect(computeSlots(base, WED)).toEqual(computeSlots(base, WED));
    });
  });

  describe('DST (Europe/London)', () => {
    const london = (o: Partial<AvailabilityInput> = {}) =>
      input({ timezone: 'Europe/London', now: new Date('2026-03-01T00:00:00Z'), rules: rules({ slot_interval_minutes: 60 }), ...o });

    it('spring-forward day has one fewer hour in a window spanning the gap', () => {
      // 2026-03-29 (Sunday): 01:00 GMT → 02:00 BST
      const i = london({ businessHours: [{ weekday: 0, start: '00:00', end: '04:00' }] });
      expect(computeSlots(i, '2026-03-29').map((s) => s.starts_at)).toEqual([
        '2026-03-29T00:00:00.000Z',
        '2026-03-29T01:00:00.000Z', // 02:00 BST
        '2026-03-29T02:00:00.000Z', // 03:00 BST
      ]);
    });

    it('fall-back day has one extra hour and no duplicate instants', () => {
      // 2026-10-25 (Sunday): 02:00 BST → 01:00 GMT
      const i = london({
        now: new Date('2026-10-01T00:00:00Z'),
        businessHours: [{ weekday: 0, start: '00:00', end: '04:00' }],
      });
      const slots = computeSlots(i, '2026-10-25').map((s) => s.starts_at);
      expect(slots).toEqual([
        '2026-10-24T23:00:00.000Z', // 00:00 BST
        '2026-10-25T00:00:00.000Z', // 01:00 BST
        '2026-10-25T01:00:00.000Z', // 01:00 GMT
        '2026-10-25T02:00:00.000Z',
        '2026-10-25T03:00:00.000Z',
      ]);
      expect(new Set(slots).size).toBe(slots.length);
    });

    it('keeps wall-clock opening hours across the transition', () => {
      const i = london({ businessHours: weekdays('09:00', '10:00') });
      expect(computeSlots(i, '2026-03-27')[0]!.starts_at).toBe('2026-03-27T09:00:00.000Z'); // GMT
      expect(computeSlots(i, '2026-03-30')[0]!.starts_at).toBe('2026-03-30T08:00:00.000Z'); // BST
    });

    it('computes durations in elapsed time across the gap', () => {
      const i = london({ businessHours: [{ weekday: 0, start: '00:30', end: '03:30' }], durationMinutes: 120 });
      // 00:30 GMT + 2h = 03:30 BST = window end → fits; nothing later fits
      expect(computeSlots(i, '2026-03-29')).toEqual([
        { starts_at: '2026-03-29T00:30:00.000Z', ends_at: '2026-03-29T02:30:00.000Z', staff_ids: [A] },
      ]);
    });
  });
});

describe('listAvailableDays', () => {
  it('returns open days in range, clipped to today…horizon', () => {
    const i = input({ rules: rules({ booking_horizon_days: 10 }) });
    expect(listAvailableDays(i, '2026-09-20', '2026-10-31')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
  });

  it('drops closed and fully booked days', () => {
    const i = input({
      overrides: [{ staff_id: null, date: '2026-09-29', is_closed: true, start_time: null, end_time: null }],
      busy: [{ staff_id: A, start: sast('09:00'), end: sast('12:00') }],
    });
    expect(listAvailableDays(i, '2026-09-28', '2026-10-01')).toEqual(['2026-09-28', '2026-10-01']);
  });

  it('is empty for an inverted range', () => {
    expect(listAvailableDays(input(), '2026-10-01', '2026-09-30')).toEqual([]);
  });
});

describe('findSlot / freeStaffIgnoringHours', () => {
  it('finds grid-aligned slots only', () => {
    expect(findSlot(input(), sast('09:30'))).toMatchObject({ staff_ids: [A] });
    expect(findSlot(input(), sast('09:10'))).toBeNull();
    expect(findSlot(input(), sast('18:00'))).toBeNull();
  });

  it('lists free staff outside hours with the same tie-break', () => {
    const i = input({
      staff: [staff(A, 0), staff(B, 1), staff(C, 2)],
      busy: [
        { staff_id: A, start: sast('19:30'), end: sast('20:30') },
        { staff_id: B, start: sast('08:00'), end: sast('08:30') },
      ],
    });
    expect(freeStaffIgnoringHours(i, sast('19:00'))).toEqual([C, B]);
  });
});
