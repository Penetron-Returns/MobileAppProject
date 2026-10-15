import { describe, expect, it } from 'vitest';

import { findConflicts, type ProposedUnavailability } from '@booking/features/availability/lib/conflicts.ts';
import { easterSunday, southAfricanPublicHolidays } from '@booking/features/availability/lib/holidays.ts';

describe('easterSunday', () => {
  it.each([
    [2022, '2022-04-17'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('%i', (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe('southAfricanPublicHolidays', () => {
  const dates = (year: number) => southAfricanPublicHolidays(year).map((h) => [h.date, h.name]);

  it('2026: fixed dates, Good Friday and Family Day from Easter, and Sunday 9 August observed on Monday 10th', () => {
    expect(dates(2026)).toEqual([
      ['2026-01-01', "New Year's Day"],
      ['2026-03-21', 'Human Rights Day'],
      ['2026-04-03', 'Good Friday'],
      ['2026-04-06', 'Family Day'],
      ['2026-04-27', 'Freedom Day'],
      ['2026-05-01', "Workers' Day"],
      ['2026-06-16', 'Youth Day'],
      ['2026-08-10', "National Women's Day (observed)"],
      ['2026-09-24', 'Heritage Day'],
      ['2026-12-16', 'Day of Reconciliation'],
      ['2026-12-25', 'Christmas Day'],
      ['2026-12-26', 'Day of Goodwill'],
    ]);
  });

  it('marks the substituted Monday with the Sunday it stands in for', () => {
    const observed = southAfricanPublicHolidays(2026).filter((h) => h.observed_for);
    expect(observed).toEqual([{ date: '2026-08-10', name: "National Women's Day (observed)", observed_for: '2026-08-09' }]);
    expect(southAfricanPublicHolidays(2026).filter((h) => !h.observed_for)).toHaveLength(11);
  });

  it('2027: Easter in March, Human Rights Day (Sunday) on Monday 22nd, Goodwill (Sunday) on Monday 27th', () => {
    const d = dates(2027);
    expect(d).toContainEqual(['2027-03-26', 'Good Friday']);
    expect(d).toContainEqual(['2027-03-29', 'Family Day']);
    expect(d).toContainEqual(['2027-03-22', 'Human Rights Day (observed)']);
    expect(d).toContainEqual(['2027-12-25', 'Christmas Day']);
    expect(d).toContainEqual(['2027-12-27', 'Day of Goodwill (observed)']);
    expect(d).not.toContainEqual(['2027-03-21', 'Human Rights Day']);
  });

  it('2022: a Sunday Christmas meets Monday Goodwill, so the observed day moves to Tuesday 27th', () => {
    const d = dates(2022);
    expect(d).toContainEqual(['2022-12-26', 'Day of Goodwill']);
    expect(d).toContainEqual(['2022-12-27', 'Christmas Day (observed)']);
    expect(d).toContainEqual(['2022-05-02', "Workers' Day (observed)"]);
  });

  it.each([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2030])('%i has 12 distinct holidays, none on a Sunday, sorted', (year) => {
    const list = southAfricanPublicHolidays(year);
    expect(list).toHaveLength(12);
    expect(new Set(list.map((h) => h.date)).size).toBe(12);
    expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
    for (const h of list) expect(new Date(`${h.date}T00:00:00Z`).getUTCDay(), h.date).not.toBe(0);
  });
});

describe('findConflicts', () => {
  const TZ = 'Africa/Johannesburg';
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const sast = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();
  const appt = (id: string, staff_id: string, startsAt: string, endsAt: string) => ({ id, staff_id, starts_at: startsAt, ends_at: endsAt });
  const morning = appt('morning', A, sast('2026-09-30', '09:00'), sast('2026-09-30', '10:00'));
  const nextDay = appt('next-day', B, sast('2026-10-01', '14:00'), sast('2026-10-01', '15:00'));
  const overnight = appt('overnight', A, sast('2026-09-30', '23:30'), sast('2026-10-01', '00:30'));
  const all = [morning, nextDay, overnight];

  const ids = (p: Partial<ProposedUnavailability> & Pick<ProposedUnavailability, 'from' | 'to'>, staffId?: string) =>
    findConflicts(all, { startTime: null, endTime: null, mode: 'closed', ...p }, TZ, staffId).map((a) => a.id);

  it.each([
    ['a whole closed day', { from: '2026-09-30', to: '2026-09-30' }, undefined, ['morning', 'overnight']],
    ['a whole day for one staff member', { from: '2026-09-30', to: '2026-09-30' }, B, []],
    ['a whole day for the other staff member', { from: '2026-10-01', to: '2026-10-01' }, B, ['next-day']],
    ['an appointment that runs past midnight into the closed day', { from: '2026-10-01', to: '2026-10-01' }, A, ['overnight']],
    ['a multi-day range', { from: '2026-09-30', to: '2026-10-01' }, undefined, ['morning', 'next-day', 'overnight']],
    ['a day with nothing booked', { from: '2026-10-05', to: '2026-10-09' }, undefined, []],
    ['partial hours overlapping', { from: '2026-09-30', to: '2026-09-30', startTime: '09:30', endTime: '10:30' }, undefined, ['morning']],
    ['partial hours that only touch', { from: '2026-09-30', to: '2026-09-30', startTime: '10:00', endTime: '11:00' }, undefined, []],
    ['partial hours apply on each date of the range', { from: '2026-09-30', to: '2026-10-01', startTime: '14:00', endTime: '16:00' }, undefined, ['next-day']],
    ['special hours (open_only): appointments outside them conflict', { from: '2026-09-30', to: '2026-09-30', startTime: '10:00', endTime: '17:00', mode: 'open_only' as const }, undefined, ['morning', 'overnight']],
    ['special hours (open_only): appointments inside them do not', { from: '2026-09-30', to: '2026-09-30', startTime: '08:00', endTime: '18:00', mode: 'open_only' as const }, undefined, ['overnight']],
    ['open_only without times blocks nothing', { from: '2026-09-30', to: '2026-09-30', mode: 'open_only' as const }, undefined, []],
    ['an inverted range', { from: '2026-10-01', to: '2026-09-30' }, undefined, []],
  ])('%s', (_name, proposal, staffId, expected) => {
    expect(ids(proposal, staffId)).toEqual(expected);
  });
});
