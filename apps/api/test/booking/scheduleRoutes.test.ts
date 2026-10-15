import { beforeEach, describe, expect, it } from 'vitest';

import { sast, WED } from './fixtures.ts';
import { harness, type Harness } from './harness.ts';

let h: Harness;
beforeEach(() => {
  h = harness();
});

const slotsUrl = (date = WED, extra = '') => `/v1/availability/slots?service_id=${h.cut.id}&date=${date}${extra}`;
const slotStarts = async (date = WED, extra = '') =>
  ((await h.call('GET', slotsUrl(date, extra))).body.data.slots as { starts_at: string; staff_ids: string[] }[]).map((s) => s.starts_at);
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('roles and idempotency', () => {
  it('keeps every write owner-only and every read open to staff', async () => {
    const dayId = (await h.call('POST', '/v1/special-days', { body: { date: '2026-10-09', name: 'X', kind: 'closure' } })).body.data.id;
    const offId = (await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: '2026-10-09' } })).body.data.id;
    for (const [method, path, body] of [
      ['POST', '/v1/special-days', { date: '2026-10-12', name: 'X', kind: 'closure' }],
      ['PATCH', `/v1/special-days/${dayId}`, { name: 'Y' }],
      ['DELETE', `/v1/special-days/${dayId}`, undefined],
      ['PUT', `/v1/staff/${h.thandi.id}/breaks`, { breaks: [] }],
      ['POST', `/v1/staff/${h.thandi.id}/time-off`, { starts_on: '2026-10-12' }],
      ['PATCH', `/v1/time-off/${offId}`, { note: 'x' }],
      ['DELETE', `/v1/time-off/${offId}`, undefined],
    ] as const) {
      const res = await h.call(method, path, { token: 'staff', body });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    for (const path of [
      '/v1/availability/config?from=2026-10-01&to=2026-10-31',
      '/v1/availability/conflicts?from=2026-10-09',
      '/v1/special-days/suggestions?year=2026',
    ]) {
      expect((await h.call('GET', path, { token: 'staff' })).status, path).toBe(200);
    }
  });

  it('requires an Idempotency-Key on the new mutations', async () => {
    const res = await h.call('POST', '/v1/special-days', { key: null, body: { date: '2026-10-09', name: 'X', kind: 'closure' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('one range per weekday', () => {
  it('rejects two business-hours ranges on one weekday', async () => {
    const res = await h.call('PUT', '/v1/business/hours', {
      body: { hours: [{ weekday: 1, opens_at: '09:00', closes_at: '12:00' }, { weekday: 1, opens_at: '13:00', closes_at: '17:00' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const ok = await h.call('PUT', '/v1/business/hours', {
      body: { hours: [1, 2, 3].map((weekday) => ({ weekday, opens_at: '09:00', closes_at: '17:00' })) },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.hours).toHaveLength(3);
  });

  it('rejects two working ranges on one weekday for a staff member', async () => {
    const res = await h.call('PUT', `/v1/staff/${h.thandi.id}/availability`, {
      body: { rules: [{ weekday: 2, start_time: '09:00', end_time: '12:00' }, { weekday: 2, start_time: '13:00', end_time: '17:00' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const ok = await h.call('PUT', `/v1/staff/${h.thandi.id}/availability`, { body: { rules: [{ weekday: 2, start_time: '09:00', end_time: '17:00' }] } });
    expect(ok.status).toBe(200);
  });

  it('rejects a split-day onboarding payload', async () => {
    const res = await h.call('POST', '/v1/onboarding', {
      token: 'newowner',
      body: {
        business: { name: 'New' },
        hours: [{ weekday: 1, opens_at: '09:00', closes_at: '12:00' }, { weekday: 1, opens_at: '13:00', closes_at: '17:00' }],
        services: [],
        team: [],
      },
    });
    expect(res.status).toBe(400);
  });
});

describe('special days', () => {
  it('a closed public holiday blocks bookings the moment it exists', async () => {
    expect((await slotStarts()).length).toBeGreaterThan(0);
    const created = await h.call('POST', '/v1/special-days', { body: { date: WED, name: 'Heritage Day', kind: 'public_holiday' } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ date: WED, name: 'Heritage Day', kind: 'public_holiday', is_closed: true, start_time: null, end_time: null });
    expect(await slotStarts()).toEqual([]);
    const days = await h.call('GET', `/v1/availability/days?service_id=${h.cut.id}&from=2026-09-29&to=2026-10-02`);
    expect(days.body.data.days).not.toContain(WED);
    expect((await h.call('DELETE', `/v1/special-days/${created.body.data.id}`)).body.data).toEqual({ id: created.body.data.id });
    expect((await slotStarts()).length).toBeGreaterThan(0);
  });

  it('special hours replace the weekday hours', async () => {
    const res = await h.call('POST', '/v1/special-days', {
      body: { date: WED, name: 'Late opening', kind: 'special_hours', start_time: '10:00', end_time: '12:00' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ kind: 'special_hours', is_closed: false, start_time: '10:00', end_time: '12:00' });
    expect(await slotStarts()).toEqual([sast('10:00'), sast('10:30'), sast('11:00')]);
  });

  it('a public holiday may have its own hours', async () => {
    const res = await h.call('POST', '/v1/special-days', {
      body: { date: WED, name: 'Half day', kind: 'public_holiday', is_closed: false, start_time: '09:00', end_time: '10:00' },
    });
    expect(res.status).toBe(201);
    expect(await slotStarts()).toEqual([sast('09:00')]);
  });

  it.each([
    ['special hours without times', { kind: 'special_hours' }],
    ['special hours with end before start', { kind: 'special_hours', start_time: '12:00', end_time: '10:00' }],
    ['a closure that is not closed', { kind: 'closure', is_closed: false, start_time: '09:00', end_time: '10:00' }],
    ['special hours that are closed', { kind: 'special_hours', is_closed: true }],
    ['an unknown kind', { kind: 'party' }],
    ['a blank name', { kind: 'closure', name: '  ' }],
    ['a malformed date', { kind: 'closure', date: '2026-13-40' }],
  ])('rejects %s', async (_name, over) => {
    const res = await h.call('POST', '/v1/special-days', { body: { date: '2026-10-09', name: 'X', ...over } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('allows one special day per date', async () => {
    await h.call('POST', '/v1/special-days', { body: { date: WED, name: 'One', kind: 'closure' } });
    const dup = await h.call('POST', '/v1/special-days', { body: { date: WED, name: 'Two', kind: 'public_holiday' } });
    expect(dup.status).toBe(400);
    expect(dup.body.error.message).toContain('already exists');
  });

  it('patches a day: merged result is validated, kind switches pick their defaults', async () => {
    const { id } = (await h.call('POST', '/v1/special-days', { body: { date: WED, name: 'Closed', kind: 'closure' } })).body.data;
    const hours = await h.call('PATCH', `/v1/special-days/${id}`, { body: { kind: 'special_hours', start_time: '10:00', end_time: '14:00' } });
    expect(hours.status).toBe(200);
    expect(hours.body.data).toMatchObject({ kind: 'special_hours', is_closed: false, start_time: '10:00', end_time: '14:00', name: 'Closed' });
    const rename = await h.call('PATCH', `/v1/special-days/${id}`, { body: { name: 'Training' } });
    expect(rename.body.data).toMatchObject({ name: 'Training', start_time: '10:00' });
    const back = await h.call('PATCH', `/v1/special-days/${id}`, { body: { kind: 'closure' } });
    expect(back.body.data).toMatchObject({ kind: 'closure', is_closed: true, start_time: null, end_time: null });
    expect((await h.call('PATCH', `/v1/special-days/${id}`, { body: { kind: 'special_hours' } })).status).toBe(400);
    const other = (await h.call('POST', '/v1/special-days', { body: { date: '2026-10-09', name: 'Other', kind: 'closure' } })).body.data.id;
    expect((await h.call('PATCH', `/v1/special-days/${other}`, { body: { date: WED } })).status).toBe(400);
    expect((await h.call('PATCH', `/v1/special-days/${UNKNOWN}`, { body: { name: 'x' } })).status).toBe(404);
    expect((await h.call('DELETE', `/v1/special-days/${UNKNOWN}`)).status).toBe(404);
  });

  it('suggests the South African public holidays and marks the ones already added', async () => {
    const before = await h.call('GET', '/v1/special-days/suggestions?year=2026');
    expect(before.status).toBe(200);
    const { year, suggestions } = before.body.data;
    expect(year).toBe(2026);
    expect(suggestions).toHaveLength(12);
    expect(suggestions.every((s: { added: boolean }) => !s.added)).toBe(true);
    expect(suggestions.find((s: { date: string }) => s.date === '2026-04-03')).toMatchObject({
      name: 'Good Friday', kind: 'public_holiday', is_closed: true, observed_for: null, added: false, special_day_id: null,
    });
    expect(suggestions.find((s: { date: string }) => s.date === '2026-08-10')).toMatchObject({ observed_for: '2026-08-09' });

    const created = await h.call('POST', '/v1/special-days', { body: { date: '2026-09-24', name: 'Heritage Day', kind: 'public_holiday' } });
    const after = (await h.call('GET', '/v1/special-days/suggestions?year=2026')).body.data.suggestions;
    expect(after.filter((s: { added: boolean }) => s.added)).toHaveLength(1);
    expect(after.find((s: { date: string }) => s.date === '2026-09-24')).toMatchObject({ added: true, special_day_id: created.body.data.id });
    expect((await h.call('GET', '/v1/special-days/suggestions?year=1999')).status).toBe(400);
    expect((await h.call('GET', '/v1/special-days/suggestions')).status).toBe(400);
  });
});

describe('staff breaks', () => {
  it('atomically replaces the breaks and shapes availability', async () => {
    const put = await h.call('PUT', `/v1/staff/${h.thandi.id}/breaks`, {
      body: { breaks: [{ label: 'Tea', start_time: '10:00', end_time: '10:30', weekdays: [3, 1, 3] }, { start_time: '14:00', end_time: '15:00' }] },
    });
    expect(put.status).toBe(200);
    expect(put.body.data.staff_id).toBe(h.thandi.id);
    expect(put.body.data.breaks).toEqual([
      expect.objectContaining({ label: 'Tea', start_time: '10:00', end_time: '10:30', weekdays: [1, 3] }),
      expect.objectContaining({ label: 'Break', start_time: '14:00', end_time: '15:00', weekdays: [] }),
    ]);
    // Thandi's lunch is gone, so she takes 12:00 again; Sipho still lunches
    const noon = (await h.call('GET', slotsUrl(WED, `&staff_id=${h.thandi.id}`))).body.data.slots.find((s: { starts_at: string }) => s.starts_at === sast('12:00'));
    expect(noon.staff_ids).toEqual([h.thandi.id]);
    const sipho = await h.call('GET', slotsUrl(WED, `&staff_id=${h.sipho.id}`));
    expect(sipho.body.data.slots.some((s: { starts_at: string }) => s.starts_at === sast('12:00'))).toBe(false);
    expect((await h.call('PUT', `/v1/staff/${h.thandi.id}/breaks`, { body: { breaks: [] } })).body.data.breaks).toEqual([]);
  });

  it.each([
    ['overlapping breaks', [{ start_time: '12:00', end_time: '13:00', weekdays: [1] }, { start_time: '12:30', end_time: '14:00' }], 422],
    ['an end before the start', [{ start_time: '13:00', end_time: '12:00' }], 400],
    ['a weekday out of range', [{ start_time: '12:00', end_time: '13:00', weekdays: [7] }], 400],
    ['a malformed time', [{ start_time: '25:00', end_time: '26:00' }], 400],
    ['a label that is too long', [{ label: 'x'.repeat(61), start_time: '12:00', end_time: '13:00' }], 400],
  ])('rejects %s', async (_name, breaks, status) => {
    const res = await h.call('PUT', `/v1/staff/${h.thandi.id}/breaks`, { body: { breaks } });
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(status === 422 ? 'RULE_VIOLATION' : 'VALIDATION_FAILED');
    if (status === 422) expect(res.body.error.details).toEqual({ rule: 'OVERLAPPING_BREAKS' });
    // a failed replace leaves the existing break intact
    const config = await h.call('GET', '/v1/availability/config?from=2026-09-28&to=2026-09-30');
    const mine = config.body.data.staff.find((s: { staff_id: string }) => s.staff_id === h.thandi.id);
    expect(mine.breaks).toHaveLength(1);
  });

  it('404s for an unknown staff member', async () => {
    expect((await h.call('PUT', `/v1/staff/${UNKNOWN}/breaks`, { body: { breaks: [] } })).status).toBe(404);
  });
});

describe('staff time off', () => {
  it('creates all-day time off (ends_on defaults to starts_on) that removes only that staff member', async () => {
    const res = await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: WED, reason: 'sick', note: ' flu ' } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ staff_id: h.thandi.id, starts_on: WED, ends_on: WED, start_time: null, end_time: null, reason: 'sick', note: 'flu' });
    const slots = (await h.call('GET', slotsUrl())).body.data.slots as { staff_ids: string[] }[];
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.staff_ids.join() === h.sipho.id)).toBe(true);
  });

  it('partial time off applies its hours on each date of a multi-day range', async () => {
    const res = await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, {
      body: { starts_on: WED, ends_on: '2026-10-01', start_time: '14:00', end_time: '16:00', reason: 'training' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ start_time: '14:00', end_time: '16:00', reason: 'training', note: null });
    for (const date of [WED, '2026-10-01']) {
      const slots = (await h.call('GET', slotsUrl(date, `&staff_id=${h.thandi.id}`))).body.data.slots as { starts_at: string }[];
      expect(slots.some((s) => s.starts_at === sast('14:00', date))).toBe(false);
      expect(slots.some((s) => s.starts_at === sast('15:00', date))).toBe(false);
      expect(slots.some((s) => s.starts_at === sast('16:00', date))).toBe(true);
    }
    const next = (await h.call('GET', slotsUrl('2026-10-02', `&staff_id=${h.thandi.id}`))).body.data.slots as { starts_at: string }[];
    expect(next.some((s) => s.starts_at === sast('14:00', '2026-10-02'))).toBe(true);
  });

  it.each([
    ['ends before it starts', { starts_on: WED, ends_on: '2026-09-29' }],
    ['only one time', { starts_on: WED, start_time: '09:00' }],
    ['an end time before the start time', { starts_on: WED, start_time: '12:00', end_time: '09:00' }],
    ['a range longer than a year', { starts_on: '2026-10-01', ends_on: '2028-01-01' }],
    ['an unknown reason', { starts_on: WED, reason: 'holiday' }],
    ['a malformed date', { starts_on: 'tomorrow' }],
  ])('rejects time off that %s', async (_name, body) => {
    const res = await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('updates, validates the merged result, and deletes', async () => {
    const { id } = (await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: WED } })).body.data;
    const partial = await h.call('PATCH', `/v1/time-off/${id}`, { body: { start_time: '09:00', end_time: '11:00', ends_on: '2026-10-01' } });
    expect(partial.body.data).toMatchObject({ starts_on: WED, ends_on: '2026-10-01', start_time: '09:00', end_time: '11:00' });
    const allDay = await h.call('PATCH', `/v1/time-off/${id}`, { body: { start_time: null, end_time: null, reason: 'leave' } });
    expect(allDay.body.data).toMatchObject({ start_time: null, end_time: null, reason: 'leave' });
    expect((await h.call('PATCH', `/v1/time-off/${id}`, { body: { ends_on: '2026-09-01' } })).status).toBe(400);
    expect((await h.call('PATCH', `/v1/time-off/${id}`, { body: { start_time: '09:00' } })).status).toBe(400);
    expect((await h.call('DELETE', `/v1/time-off/${id}`)).body.data).toEqual({ id });
    expect((await h.call('DELETE', `/v1/time-off/${id}`)).status).toBe(404);
    expect((await h.call('PATCH', `/v1/time-off/${UNKNOWN}`, { body: { note: 'x' } })).status).toBe(404);
  });

  it('404s for an unknown staff member', async () => {
    expect((await h.call('POST', `/v1/staff/${UNKNOWN}/time-off`, { body: { starts_on: WED } })).status).toBe(404);
  });
});

describe('GET /v1/availability/config', () => {
  it('returns hours, special days in range and each staff member schedule in one call', async () => {
    await h.call('POST', '/v1/special-days', { body: { date: '2026-10-09', name: 'Heritage Day', kind: 'public_holiday' } });
    await h.call('POST', '/v1/special-days', { body: { date: '2026-12-25', name: 'Christmas Day', kind: 'public_holiday' } });
    await h.call('PUT', `/v1/staff/${h.sipho.id}/availability`, { body: { rules: [{ weekday: 1, start_time: '10:00', end_time: '16:00' }] } });
    await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: '2026-10-05', ends_on: '2026-10-06', reason: 'leave' } });
    await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: '2026-11-20' } });
    await h.call('POST', '/v1/overrides', { body: { staff_id: h.sipho.id, date: '2026-10-07', is_closed: true, reason: 'Course' } });

    const res = await h.call('GET', '/v1/availability/config?from=2026-10-01&to=2026-10-31');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toMatchObject({ from: '2026-10-01', to: '2026-10-31', timezone: 'Africa/Johannesburg' });
    expect(data.business_hours).toHaveLength(5);
    expect(data.business_hours[0]).toEqual({ weekday: 1, opens_at: '09:00', closes_at: '17:00' });
    expect(data.special_days).toEqual([expect.objectContaining({ date: '2026-10-09', name: 'Heritage Day' })]);
    const byId = (id: string) => data.staff.find((s: { staff_id: string }) => s.staff_id === id);
    // thandi, sipho, off, plus the owner's own staff row created on first sign-in
    expect(data.staff).toHaveLength(4);
    expect(byId(h.thandi.id)).toMatchObject({ rules: [], breaks: [expect.objectContaining({ label: 'Lunch', start_time: '12:00', end_time: '13:00', weekdays: [] })] });
    expect(byId(h.thandi.id).time_off).toEqual([expect.objectContaining({ starts_on: '2026-10-05', ends_on: '2026-10-06', reason: 'leave' })]);
    expect(byId(h.sipho.id).rules).toEqual([{ weekday: 1, start_time: '10:00', end_time: '16:00' }]);
    expect(byId(h.sipho.id).overrides).toEqual([expect.objectContaining({ date: '2026-10-07', is_closed: true, reason: 'Course' })]);
    expect(byId(h.off.id)).toMatchObject({ rules: [], breaks: [], time_off: [], overrides: [] });
  });

  it('includes time off that merely overlaps the range', async () => {
    await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: '2026-09-25', ends_on: '2026-10-02' } });
    const data = (await h.call('GET', '/v1/availability/config?from=2026-10-01&to=2026-10-31')).body.data;
    expect(data.staff.find((s: { staff_id: string }) => s.staff_id === h.thandi.id).time_off).toHaveLength(1);
  });

  it.each([
    ['a missing range', ''],
    ['an inverted range', '?from=2026-10-31&to=2026-10-01'],
    ['a range over a year', '?from=2026-01-01&to=2027-06-01'],
  ])('rejects %s', async (_name, query) => {
    expect((await h.call('GET', `/v1/availability/config${query}`)).status).toBe(400);
  });
});

describe('GET /v1/availability/conflicts', () => {
  const book = async (staffId: string, startsAt: string) => {
    const res = await h.call('POST', '/v1/appointments', { body: { client_id: h.client.id, service_id: h.cut.id, staff_id: staffId, starts_at: startsAt } });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  it('lists the confirmed appointments a closed day would overlap, and never cancels them', async () => {
    const mine = await book(h.thandi.id, sast('09:00'));
    const theirs = await book(h.sipho.id, sast('10:00'));
    const later = await book(h.thandi.id, sast('09:00', '2026-10-01'));

    const day = await h.call('GET', `/v1/availability/conflicts?from=${WED}&to=${WED}`);
    expect(day.status).toBe(200);
    expect(day.body.data.conflicts.map((a: { id: string }) => a.id).sort()).toEqual([mine, theirs].sort());
    expect(day.body.data.conflicts[0]).toMatchObject({ status: 'confirmed', client_id: h.client.id });

    const oneStaff = await h.call('GET', `/v1/availability/conflicts?from=${WED}&staff_id=${h.thandi.id}`);
    expect(oneStaff.body.data.conflicts.map((a: { id: string }) => a.id)).toEqual([mine]);

    const range = await h.call('GET', `/v1/availability/conflicts?from=${WED}&to=2026-10-01`);
    expect(range.body.data.conflicts).toHaveLength(3);
    expect(range.body.data.conflicts.map((a: { id: string }) => a.id)).toContain(later);

    // nothing was cancelled or moved
    expect(h.repo.tables.appointments).toHaveLength(3);
    expect(h.repo.tables.appointments.every((a) => a.status === 'confirmed')).toBe(true);
  });

  it('applies partial hours, and open_only flags appointments outside the special hours', async () => {
    const early = await book(h.thandi.id, sast('09:00'));
    const afternoon = await book(h.thandi.id, sast('14:00'));
    const partial = await h.call('GET', `/v1/availability/conflicts?from=${WED}&start_time=13:30&end_time=15:00`);
    expect(partial.body.data.conflicts.map((a: { id: string }) => a.id)).toEqual([afternoon]);
    const open = await h.call('GET', `/v1/availability/conflicts?from=${WED}&mode=open_only&start_time=10:00&end_time=17:00`);
    expect(open.body.data.conflicts.map((a: { id: string }) => a.id)).toEqual([early]);
  });

  it('ignores cancelled appointments and other days', async () => {
    const id = await book(h.thandi.id, sast('09:00'));
    await h.call('POST', `/v1/appointments/${id}/cancel`, { body: {} });
    expect((await h.call('GET', `/v1/availability/conflicts?from=${WED}`)).body.data.conflicts).toEqual([]);
    expect((await h.call('GET', '/v1/availability/conflicts?from=2026-10-05&to=2026-10-09')).body.data.conflicts).toEqual([]);
  });

  it.each([
    ['no from', ''],
    ['an inverted range', '?from=2026-10-02&to=2026-10-01'],
    ['only one time', `?from=${WED}&start_time=09:00`],
    ['an end before the start', `?from=${WED}&start_time=12:00&end_time=09:00`],
    ['open_only without times', `?from=${WED}&mode=open_only`],
    ['an unknown mode', `?from=${WED}&mode=wide`],
  ])('rejects %s', async (_name, query) => {
    expect((await h.call('GET', `/v1/availability/conflicts${query}`)).status).toBe(400);
  });

  it('404s for an unknown staff member', async () => {
    expect((await h.call('GET', `/v1/availability/conflicts?from=${WED}&staff_id=${UNKNOWN}`)).status).toBe(404);
  });
});

describe('booking guard: breaks, time off and special days', () => {
  const createAt = (startsAt: string, extra: Record<string, unknown> = {}) =>
    h.call('POST', '/v1/appointments', {
      body: { client_id: h.client.id, service_id: h.cut.id, staff_id: h.thandi.id, starts_at: startsAt, ...extra },
    });

  it('rejects a staff booking inside a break, time off or a closed special day', async () => {
    const inBreak = await createAt(sast('12:00'));
    expect(inBreak.status).toBe(409);
    expect(inBreak.body.error.code).toBe('SLOT_UNAVAILABLE');

    await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: WED, start_time: '14:00', end_time: '16:00' } });
    expect((await createAt(sast('14:30'))).status).toBe(409);
    expect((await createAt(sast('09:00'))).status).toBe(201);

    await h.call('POST', '/v1/special-days', { body: { date: '2026-10-01', name: 'Closed', kind: 'closure' } });
    const closed = await createAt(sast('09:00', '2026-10-01'));
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('applies the same guard when no staff member is chosen', async () => {
    await h.call('POST', `/v1/staff/${h.thandi.id}/time-off`, { body: { starts_on: WED } });
    await h.call('POST', `/v1/staff/${h.sipho.id}/time-off`, { body: { starts_on: WED } });
    const res = await h.call('POST', '/v1/appointments', { body: { client_id: h.client.id, service_id: h.cut.id, starts_at: sast('10:00') } });
    expect(res.status).toBe(409);
  });

  it('lets staff walk-ins opt out with allow_outside_hours, as for hours today', async () => {
    const res = await createAt(sast('12:00'), { allow_outside_hours: true });
    expect(res.status).toBe(201);
    await h.call('POST', '/v1/special-days', { body: { date: '2026-10-01', name: 'Closed', kind: 'closure' } });
    expect((await createAt(sast('09:00', '2026-10-01'), { allow_outside_hours: true })).status).toBe(201);
  });

  it('rejects rescheduling into a break and allows it elsewhere', async () => {
    const id = (await createAt(sast('09:00'))).body.data.id as string;
    const into = await h.call('POST', `/v1/appointments/${id}/reschedule`, { body: { starts_at: sast('12:00') } });
    expect(into.status).toBe(409);
    expect(into.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect((await h.call('POST', `/v1/appointments/${id}/reschedule`, { body: { starts_at: sast('13:00') } })).status).toBe(200);
  });
});
