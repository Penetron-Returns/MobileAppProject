import type {
  AppointmentDTO,
  SpecialDayDTO,
  SpecialDaySuggestionDTO,
  StaffBreakDTO,
  StaffTimeOffDTO,
} from '@booking/types';

import {
  breakTimes,
  breaksOverlap,
  breaksWith,
  breaksWithout,
  draftFromBreak,
  newBreakDraft,
  sortBreaks,
  toggleWeekday,
  validateBreak,
  weekdaysLabel,
} from '../breaks';
import { conflictLine, mergeConflicts } from '../conflicts';
import { buildMonthView, monthOf, shiftMonth } from '../monthGrid';
import {
  changesAvailability,
  closedDays,
  draftFromSpecialDay,
  newSpecialDraft,
  pendingSuggestions,
  specialDayConflictQuery,
  specialDayValue,
  suggestionRequest,
  toSpecialDayRequest,
  upcomingSpecialDays,
  validateSpecialDay,
} from '../specialDays';
import {
  draftFromTimeOff,
  newTimeOffDraft,
  timeOffConflictQuery,
  timeOffRange,
  toTimeOffRequest,
  upcomingTimeOff,
  validateTimeOff,
} from '../timeOff';

const special = (o: Partial<SpecialDayDTO> = {}): SpecialDayDTO => ({
  id: 'sd1',
  date: '2026-12-25',
  name: 'Christmas Day',
  kind: 'public_holiday',
  is_closed: true,
  start_time: null,
  end_time: null,
  ...o,
});

describe('special days', () => {
  it('lists only upcoming days, soonest first', () => {
    const days = [
      special({ id: 'b', date: '2026-12-26' }),
      special({ id: 'old', date: '2026-10-01' }),
      special({ id: 'a', date: '2026-12-16' }),
    ];
    expect(upcomingSpecialDays(days, '2026-10-15').map((d) => d.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('shows Closed or the hours with a hyphen, as the board does', () => {
    expect(specialDayValue(special(), 'Closed')).toBe('Closed');
    expect(
      specialDayValue(
        special({
          is_closed: false,
          start_time: '09:00:00',
          end_time: '13:00:00',
        }),
        'Closed',
      ),
    ).toBe('09:00-13:00');
  });

  it('offers upcoming public holidays not yet added, once per date', () => {
    const s = (
      o: Partial<SpecialDaySuggestionDTO>,
    ): SpecialDaySuggestionDTO => ({
      date: '2026-12-16',
      name: 'Day of Reconciliation',
      kind: 'public_holiday',
      is_closed: true,
      observed_for: null,
      added: false,
      special_day_id: null,
      ...o,
    });
    const list = pendingSuggestions(
      [
        s({ date: '2026-12-25', name: 'Christmas Day' }),
        s({ date: '2026-03-21', name: 'Human Rights Day' }),
        s({ date: '2026-12-26', added: true }),
        s({}),
        s({}),
      ],
      '2026-10-15',
    );
    expect(list.map((x) => x.date)).toEqual(['2026-12-16', '2026-12-25']);
    expect(suggestionRequest(list[1])).toEqual({
      date: '2026-12-25',
      name: 'Christmas Day',
      kind: 'public_holiday',
      is_closed: true,
    });
  });

  it.each([
    ['a nameless day', { name: ' ' }, 'name'],
    [
      'special hours ending before they start',
      { mode: 'hours' as const, start: '13:00', end: '09:00' },
      'order',
    ],
    ['a named closed day', { name: 'Staff day' }, null],
  ])('validates %s', (_label, patch, expected) => {
    expect(
      validateSpecialDay({
        ...newSpecialDraft('2026-12-01'),
        name: 'x',
        ...patch,
      }),
    ).toBe(expected);
  });

  it('builds a closed day (keeping a holiday kind) or special hours', () => {
    const closed = { ...newSpecialDraft('2026-12-01'), name: ' Staff day ' };
    expect(toSpecialDayRequest(closed)).toEqual({
      date: '2026-12-01',
      name: 'Staff day',
      kind: 'closure',
      is_closed: true,
      start_time: null,
      end_time: null,
    });
    expect(
      toSpecialDayRequest({ ...closed, kind: 'public_holiday' }).kind,
    ).toBe('public_holiday');
    expect(toSpecialDayRequest({ ...closed, mode: 'hours' })).toMatchObject({
      kind: 'special_hours',
      is_closed: false,
      start_time: '09:00',
      end_time: '13:00',
    });
  });

  it('checks closed days as closed and special hours as open-only', () => {
    expect(specialDayConflictQuery(newSpecialDraft('2026-12-01'))).toEqual({
      from: '2026-12-01',
      mode: 'closed',
    });
    expect(
      specialDayConflictQuery({
        ...newSpecialDraft('2026-12-01'),
        mode: 'hours',
      }),
    ).toEqual({
      from: '2026-12-01',
      start_time: '09:00',
      end_time: '13:00',
      mode: 'open_only',
    });
  });

  it('skips the bookings check for a rename alone', () => {
    const day = special();
    const draft = draftFromSpecialDay(day);
    expect(changesAvailability(day, { ...draft, name: 'New name' })).toBe(
      false,
    );
    expect(changesAvailability(day, { ...draft, date: '2026-12-24' })).toBe(
      true,
    );
    expect(changesAvailability(day, { ...draft, mode: 'hours' })).toBe(true);
    expect(changesAvailability(null, draft)).toBe(true);
  });

  it('lists the closed days in a range for the booking note', () => {
    const days = [
      special({ date: '2026-12-26' }),
      special({ date: '2026-12-25', id: 'x' }),
      special({
        date: '2026-12-27',
        is_closed: false,
        start_time: '09:00:00',
        end_time: '12:00:00',
      }),
      special({ date: '2027-01-01' }),
    ];
    expect(
      closedDays(days, '2026-12-01', '2026-12-31').map((d) => d.date),
    ).toEqual(['2026-12-25', '2026-12-26']);
  });
});

describe('breaks', () => {
  const brk = (o: Partial<StaffBreakDTO> = {}): StaffBreakDTO => ({
    id: 'b1',
    staff_id: 's1',
    label: 'Lunch',
    start_time: '13:00:00',
    end_time: '13:30:00',
    weekdays: [],
    ...o,
  });

  it.each([
    [[], 'Every working day'],
    [[1, 3], 'Mon, Wed'],
    [[0, 1], 'Mon, Sun'],
    [[0, 1, 2, 3, 4, 5, 6], 'Every working day'],
  ])('labels weekdays %j as %s', (days, expected) => {
    expect(weekdaysLabel(days, 'Every working day')).toBe(expected);
  });

  it('formats the times and sorts by start', () => {
    expect(breakTimes(brk(), 'to')).toBe('13:00 to 13:30');
    expect(
      sortBreaks([
        brk({ id: 'b', start_time: '15:00:00' }),
        brk({ id: 'a' }),
      ]).map((b) => b.id),
    ).toEqual(['a', 'b']);
  });

  it.each([
    ['clash on every day', [], [], '13:15', '14:00', true],
    ['clash on a shared weekday', [1, 2], [2, 3], '13:15', '14:00', true],
    ['no shared weekday', [1], [2], '13:15', '14:00', false],
    ['back to back', [], [], '13:30', '14:00', false],
  ])('overlap: %s', (_l, daysA, daysB, start, end, expected) => {
    const a = { ...draftFromBreak(brk()), weekdays: daysA };
    const b = { label: 'B', start, end, weekdays: daysB };
    expect(breaksOverlap(a, b)).toBe(expected);
  });

  it('validates the name, the order and clashes with the other breaks', () => {
    const others = [brk()];
    const ok = { label: 'Tea', start: '10:00', end: '10:15', weekdays: [] };
    expect(validateBreak(ok, others)).toBeNull();
    expect(validateBreak({ ...ok, label: ' ' }, others)).toBe('label');
    expect(validateBreak({ ...ok, end: '09:00' }, others)).toBe('order');
    expect(validateBreak({ ...ok, start: '13:10', end: '13:20' }, others)).toBe(
      'overlap',
    );
  });

  it('builds the full set to PUT when adding, editing and removing', () => {
    const lunch = brk();
    const tea = brk({
      id: 'b2',
      label: 'Tea',
      start_time: '10:00:00',
      end_time: '10:15:00',
    });
    const added = breaksWith([lunch], null, {
      ...newBreakDraft(),
      label: ' Tea ',
      start: '10:00',
      end: '10:15',
      weekdays: [3, 1],
    });
    expect(added).toEqual([
      { label: 'Lunch', start_time: '13:00', end_time: '13:30', weekdays: [] },
      {
        label: 'Tea',
        start_time: '10:00',
        end_time: '10:15',
        weekdays: [1, 3],
      },
    ]);
    const edited = breaksWith([lunch, tea], 'b2', {
      label: 'Tea',
      start: '11:00',
      end: '11:15',
      weekdays: [],
    });
    expect(edited.map((b) => b.start_time)).toEqual(['13:00', '11:00']);
    expect(breaksWithout([lunch, tea], 'b1')).toEqual([
      { label: 'Tea', start_time: '10:00', end_time: '10:15', weekdays: [] },
    ]);
  });

  it('narrows from every day to chosen days and back', () => {
    expect(toggleWeekday([], 1)).toEqual([1]);
    expect(toggleWeekday([1], 3)).toEqual([1, 3]);
    expect(toggleWeekday([1, 3], 1)).toEqual([3]);
    expect(toggleWeekday([1, 2, 3, 4, 5, 6], 0)).toEqual([]);
  });
});

describe('time off', () => {
  const off = (o: Partial<StaffTimeOffDTO> = {}): StaffTimeOffDTO => ({
    id: 't1',
    staff_id: 's1',
    starts_on: '2026-12-24',
    ends_on: '2026-12-26',
    start_time: null,
    end_time: null,
    reason: 'leave',
    note: null,
    ...o,
  });

  it.each([
    ['a range in one month', off(), '24 to 26 Dec'],
    ['a single day', off({ ends_on: '2026-12-24' }), '24 Dec'],
    [
      'across months',
      off({ starts_on: '2026-12-30', ends_on: '2027-01-02' }),
      '30 Dec to 2 Jan',
    ],
    [
      'hours on one day',
      off({
        starts_on: '2026-12-24',
        ends_on: '2026-12-24',
        start_time: '14:00:00',
        end_time: '17:00:00',
      }),
      'Thu 24 Dec, 14:00 to 17:00',
    ],
    [
      'hours over several days',
      off({ start_time: '14:00:00', end_time: '17:00:00' }),
      '24 to 26 Dec, 14:00 to 17:00',
    ],
  ])('formats %s', (_l, entry, expected) => {
    expect(timeOffRange(entry, 'to')).toBe(expected);
  });

  it('lists entries that have not ended, soonest first', () => {
    const list = upcomingTimeOff(
      [
        off({ id: 'b', starts_on: '2026-12-30', ends_on: '2026-12-31' }),
        off({ id: 'gone', ends_on: '2026-10-01', starts_on: '2026-10-01' }),
        off({ id: 'a' }),
      ],
      '2026-10-15',
    );
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('starts as one all-day day and round-trips an entry', () => {
    const draft = newTimeOffDraft('2026-12-24');
    expect(draft).toMatchObject({
      startsOn: '2026-12-24',
      endsOn: '2026-12-24',
      allDay: true,
      reason: 'leave',
    });
    expect(toTimeOffRequest(draft)).toEqual({
      starts_on: '2026-12-24',
      ends_on: '2026-12-24',
      start_time: null,
      end_time: null,
      reason: 'leave',
      note: null,
    });
    const timed = draftFromTimeOff(
      off({ start_time: '14:00:00', end_time: '17:00:00', note: 'Course' }),
    );
    expect(timed.allDay).toBe(false);
    expect(toTimeOffRequest(timed)).toMatchObject({
      start_time: '14:00',
      end_time: '17:00',
      note: 'Course',
    });
  });

  it.each([
    ['a last day before the first', { endsOn: '2026-12-23' }, 'range'],
    [
      'hours ending before they start',
      { allDay: false, start: '15:00', end: '14:00' },
      'order',
    ],
    ['a valid range', {}, null],
  ])('validates %s', (_l, patch, expected) => {
    expect(
      validateTimeOff({ ...newTimeOffDraft('2026-12-24'), ...patch }),
    ).toBe(expected);
  });

  it('checks the person, the dates and (for hours) the times', () => {
    expect(timeOffConflictQuery('s1', newTimeOffDraft('2026-12-24'))).toEqual({
      from: '2026-12-24',
      to: '2026-12-24',
      staff_id: 's1',
      mode: 'closed',
    });
    expect(
      timeOffConflictQuery('s1', {
        ...newTimeOffDraft('2026-12-24'),
        allDay: false,
      }),
    ).toMatchObject({ start_time: '09:00', end_time: '13:00' });
  });
});

describe('conflicts', () => {
  const appt = (id: string, startsAt: string) =>
    ({ id, starts_at: startsAt }) as AppointmentDTO;

  it('merges lists into one, each booking once, oldest first', () => {
    const a = appt('a', '2026-10-15T08:00:00.000Z');
    const b = appt('b', '2026-10-15T07:00:00.000Z');
    expect(mergeConflicts([[a], [b, a]]).map((x) => x.id)).toEqual(['b', 'a']);
    expect(mergeConflicts([])).toEqual([]);
  });

  it('writes the time, then the names once loaded, then the date for several days', () => {
    const a = appt('a', '2026-10-15T08:00:00.000Z'); // 10:00 in Johannesburg
    const tz = 'Africa/Johannesburg';
    expect(conflictLine(a, undefined, tz)).toBe('10:00');
    expect(
      conflictLine(a, { client: 'Thabo', service: "Men's Haircut" }, tz),
    ).toBe("10:00 Thabo, Men's Haircut");
    expect(conflictLine(a, { client: 'Thabo', service: null }, tz, true)).toBe(
      'Thu 15 Oct, 10:00 Thabo',
    );
  });
});

describe('monthGrid', () => {
  it('lays a month out Monday first with blanks around it', () => {
    const view = buildMonthView({
      month: { year: 2026, month: 12 },
      selected: '2026-12-25',
      today: '2026-12-01',
    });
    expect(view.title).toBe('December 2026');
    expect(view.weeks.every((w) => w.length === 7)).toBe(true);
    // 1 Dec 2026 is a Tuesday: one blank before it.
    expect(view.weeks[0][0]).toBeNull();
    expect(view.weeks[0][1]).toMatchObject({
      value: '2026-12-01',
      today: true,
    });
    const days = view.weeks.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    expect(days.find((d) => d?.selected)?.value).toBe('2026-12-25');
    expect(
      days.find((d) => d?.value === '2026-12-25')?.accessibilityLabel,
    ).toBe('Friday 25 December');
  });

  it('switches off days before the minimum and the previous month when it is all past', () => {
    const view = buildMonthView({
      month: { year: 2026, month: 12 },
      selected: '2026-12-10',
      today: '2026-12-01',
      min: '2026-12-05',
    });
    const days = view.weeks.flat().filter((d) => d !== null);
    expect(days.filter((d) => d?.disabled)).toHaveLength(4);
    expect(view.canGoPrevious).toBe(false);
    expect(
      buildMonthView({
        month: { year: 2026, month: 12 },
        selected: '',
        today: '',
        min: '2026-11-20',
      }).canGoPrevious,
    ).toBe(true);
  });

  it('steps across the year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({
      year: 2026,
      month: 12,
    });
    expect(monthOf('2026-03-09')).toEqual({ year: 2026, month: 3 });
  });
});
