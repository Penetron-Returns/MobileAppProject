import { describe, expect, it } from 'vitest';

import { sast, WED } from '../booking/fixtures.ts';
import { nerovaHarness } from './harness.ts';

const code = (r: { structuredContent: { code?: string } }) => r.structuredContent.code;

describe('accounts', () => {
  it('lists only businesses entitled to the companion and hides Free ones', async () => {
    const h = nerovaHarness();
    const { data, hasMore } = await h.ok('accounts_list', {});
    expect(hasMore).toBe(false);
    expect(data.map((a: { id: string }) => a.id)).toEqual([h.business.id]);
    expect(JSON.stringify(data)).not.toContain('Free Salon');
  });

  it('paginates in a stable order with nextCursor', async () => {
    const h = nerovaHarness();
    const extra = h.repo.nextId();
    h.repo.tables.businesses.push({ ...h.business, id: extra, clerk_org_id: 'org_x', slug: 'x', name: 'Second' });
    h.plans.set(extra, 'pro');
    const first = await h.ok('accounts_list', { limit: 1 });
    expect(first.hasMore).toBe(true);
    expect(first.data).toHaveLength(1);
    const second = await h.ok('accounts_list', { limit: 1, cursor: first.nextCursor });
    expect(second.hasMore).toBe(false);
    expect(second).not.toHaveProperty('nextCursor');
    expect([first.data[0].id, second.data[0].id].sort()).toEqual([h.business.id, extra].sort());
    expect((await h.tool('accounts_list', { cursor: 'garbage' })).structuredContent.code).toBe('invalid_request');
  });

  it('returns the account with zone, currency, one location and opening hours', async () => {
    const h = nerovaHarness();
    h.repo.tables.business_special_days.push({
      id: h.repo.nextId(), business_id: h.business.id, date: '2026-12-25', name: 'Christmas Day',
      kind: 'public_holiday', is_closed: true, start_time: null, end_time: null,
    });
    const account = await h.ok('accounts_get', { accountId: h.business.id });
    expect(account).toMatchObject({
      id: h.business.id,
      displayName: 'Salon',
      timeZone: 'Africa/Johannesburg',
      currency: 'ZAR',
      locations: [{ id: h.business.id, name: 'Salon' }],
    });
    const days = account.openingHours.weekly[0].days;
    expect(days).toHaveLength(7);
    expect(days.find((d: { day: string }) => d.day === 'monday').ranges).toEqual([{ open: '09:00', close: '17:00' }]);
    expect(days.find((d: { day: string }) => d.day === 'sunday').ranges).toEqual([]);
    expect(account.openingHours.exceptions).toEqual([
      { date: '2026-12-25', externalLocationId: h.business.id, ranges: [], reason: 'Christmas Day' },
    ]);
  });

  it.each([
    ['a Free-plan business', (h: ReturnType<typeof nerovaHarness>) => h.freeBusinessId],
    ['an unknown business', () => '00000000-0000-4000-8000-0000000000ff'],
    ['a malformed id', () => 'not-a-uuid'],
  ])('answers not_found for %s, on every per-account tool', async (_label, pick) => {
    const h = nerovaHarness();
    const accountId = pick(h);
    const calls: [string, Record<string, unknown>][] = [
      ['accounts_get', {}],
      ['services_list', {}],
      ['staff_list', {}],
      ['availability_search', { serviceId: h.cut.id, start: sast('09:00'), end: sast('17:00') }],
      ['appointments_get', { appointmentId: h.cut.id }],
      ['appointments_list', { from: sast('00:00'), to: sast('23:00') }],
      ['appointments_create', { idempotencyKey: 'k', externalServiceId: h.cut.id, externalStaffId: h.thandi.id, startTime: sast('09:00'), client: { name: 'A', phone: '+27821230000' } }],
      ['appointments_reschedule', { appointmentId: h.cut.id, newStartTime: sast('10:00') }],
      ['appointments_cancel', { appointmentId: h.cut.id }],
    ];
    for (const [name, args] of calls) {
      expect(code(await h.tool(name, { accountId, ...args })), name).toBe('not_found');
    }
  });

  it('stops exposing an account the moment its plan loses the companion', async () => {
    const h = nerovaHarness();
    expect((await h.tool('accounts_get', { accountId: h.business.id })).isError).toBeUndefined();
    h.plans.set(h.business.id, 'free');
    expect(code(await h.tool('accounts_get', { accountId: h.business.id }))).toBe('not_found');
    expect((await h.ok('accounts_list', {})).data).toEqual([]);
  });
});

describe('services_list and staff_list', () => {
  it('lists active services with integer cents and the business currency', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('services_list', { accountId: h.business.id });
    expect(data.map((s: { name: string }) => s.name).sort()).toEqual(['Colour', 'Cut']);
    expect(data.find((s: { name: string }) => s.name === 'Cut')).toEqual({
      externalServiceId: h.cut.id,
      name: 'Cut',
      durationMinutes: 60,
      price: { amountCents: 60000, currency: 'ZAR' },
    });
  });

  it('lists bookable staff with the active services each performs', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('staff_list', { accountId: h.business.id });
    expect(data.map((s: { name: string }) => s.name)).toEqual(['Thandi', 'Sipho']);
    const thandi = data.find((s: { name: string }) => s.name === 'Thandi');
    expect(thandi.externalServiceIds.sort()).toEqual([h.cut.id, h.colour.id].sort());
  });
});

describe('.NET round-trip instants (7 fractional digits)', () => {
  const dotnet = (hhmm: string) => sast(hhmm).replace('.000Z', '.0000000+00:00');

  it('availability_search accepts them and returns the same slots', async () => {
    const h = nerovaHarness();
    const base = { accountId: h.business.id, serviceId: h.cut.id };
    const plain = await h.ok('availability_search', { ...base, start: sast('00:00'), end: sast('23:59') });
    const net = await h.ok('availability_search', { ...base, start: dotnet('00:00'), end: dotnet('23:59') });
    expect(net.data.length).toBeGreaterThan(0);
    expect(net.data).toEqual(plain.data);
  });

  it('appointments_list accepts them', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', {
      accountId: h.business.id, idempotencyKey: 'dn1', externalServiceId: h.cut.id, externalStaffId: h.thandi.id,
      startTime: dotnet('09:00'), client: { name: 'Nadia', phone: '+27821234567' },
    });
    const list = await h.ok('appointments_list', { accountId: h.business.id, from: dotnet('00:00'), to: dotnet('23:59') });
    expect(list.items.map((i: { startTime: string }) => i.startTime)).toEqual([sast('09:00')]);
  });
});

describe('availability_search', () => {
  const window = { start: sast('00:00'), end: sast('23:59') };

  it('returns live slots with the staff who take them, inside the window', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('availability_search', { accountId: h.business.id, serviceId: h.cut.id, ...window });
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toEqual({ startTime: sast('09:00'), endTime: sast('10:00'), externalStaffId: h.thandi.id });
    expect(data.some((s: { externalStaffId: string }) => s.externalStaffId === h.sipho.id)).toBe(true);
    for (const s of data) {
      expect(Date.parse(s.startTime)).toBeGreaterThanOrEqual(Date.parse(window.start));
      expect(Date.parse(s.endTime)).toBeLessThanOrEqual(Date.parse(window.end));
    }
  });

  it('never offers a slot that was just booked (live, no cache)', async () => {
    const h = nerovaHarness();
    const args = { accountId: h.business.id, serviceId: h.colour.id, ...window };
    const before = await h.ok('availability_search', args);
    expect(before.data.some((s: { startTime: string }) => s.startTime === sast('09:00'))).toBe(true);
    await h.ok('appointments_create', {
      accountId: h.business.id, idempotencyKey: 'live-1', externalServiceId: h.colour.id, externalStaffId: h.thandi.id,
      startTime: sast('09:00'), client: { name: 'Zed', phone: '+27821110000' },
    });
    const after = await h.ok('availability_search', args);
    expect(after.data.some((s: { startTime: string }) => s.startTime === sast('09:00'))).toBe(false);
  });

  it('filters by staff and spans several days', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('availability_search', {
      accountId: h.business.id, serviceId: h.cut.id, staffId: h.sipho.id, start: sast('00:00'), end: sast('00:00', '2026-10-02'),
    });
    expect(new Set(data.map((s: { externalStaffId: string }) => s.externalStaffId))).toEqual(new Set([h.sipho.id]));
    expect(new Set(data.map((s: { startTime: string }) => s.startTime.slice(0, 10))).size).toBeGreaterThan(1);
  });

  it('validates the window and the ids', async () => {
    const h = nerovaHarness();
    const base = { accountId: h.business.id, serviceId: h.cut.id };
    expect(code(await h.tool('availability_search', { ...base, start: sast('10:00'), end: sast('09:00') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_search', { ...base, start: sast('00:00'), end: sast('00:00', '2026-12-01') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_search', { ...base, start: 'tomorrow', end: sast('09:00') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_search', { ...base, serviceId: '00000000-0000-4000-8000-0000000000aa', ...window }))).toBe('not_found');
    expect(code(await h.tool('availability_search', { ...base, staffId: '00000000-0000-4000-8000-0000000000aa', ...window }))).toBe('not_found');
    expect(code(await h.tool('availability_search', { ...base, serviceId: 'nope', ...window }))).toBe('not_found');
  });

  it('returns the new availability model: breaks, time off and special days are not offered', async () => {
    const h = nerovaHarness();
    const base = { accountId: h.business.id, serviceId: h.cut.id, staffId: h.thandi.id, ...window };
    const startsAt = async (args: Record<string, unknown>) =>
      (await h.ok('availability_search', args)).data.map((s: { startTime: string }) => s.startTime);
    // Fixture: Thandi lunches 12:00-13:00 every day
    expect(await startsAt(base)).not.toContain(sast('12:00'));
    expect(await startsAt(base)).toContain(sast('11:00'));

    h.repo.tables.staff_time_off.push({
      id: h.repo.nextId(), business_id: h.business.id, staff_id: h.thandi.id, starts_on: WED, ends_on: WED,
      start_time: '14:00:00', end_time: '16:00:00', reason: 'other', note: null,
    });
    const withTimeOff = await startsAt(base);
    expect(withTimeOff).not.toContain(sast('14:00'));
    expect(withTimeOff).not.toContain(sast('15:00'));
    expect(withTimeOff).toContain(sast('16:00'));

    h.repo.tables.business_special_days.push({
      id: h.repo.nextId(), business_id: h.business.id, date: WED, name: 'Heritage Day', kind: 'public_holiday',
      is_closed: true, start_time: null, end_time: null,
    });
    expect(await startsAt({ ...base, staffId: undefined })).toEqual([]);
  });

  it('is empty for an inactive service', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('availability_search', { accountId: h.business.id, serviceId: h.inactive.id, ...window });
    expect(data).toEqual([]);
  });
});

describe('appointments_get and appointments_list', () => {
  async function book(h: ReturnType<typeof nerovaHarness>, key: string, time: string, extra: Record<string, unknown> = {}) {
    return h.ok('appointments_create', {
      accountId: h.business.id, idempotencyKey: key, externalServiceId: h.cut.id, externalStaffId: h.thandi.id,
      startTime: sast(time), client: { name: 'Nadia', phone: '+27821234567' }, ...extra,
    });
  }

  it('reads an appointment straight after the write', async () => {
    const h = nerovaHarness();
    const created = await book(h, 'g1', '09:00');
    const read = await h.ok('appointments_get', { accountId: h.business.id, appointmentId: created.externalAppointmentId });
    expect(read).toEqual(created);
    expect(read).toMatchObject({ status: 'Scheduled', startTime: sast('09:00'), endTime: sast('10:00'), externalLocationId: h.business.id });
  });

  it('is not_found for unknown, malformed and other-business appointments', async () => {
    const h = nerovaHarness();
    const other = h.repo.nextId();
    for (const appointmentId of ['00000000-0000-4000-8000-0000000000aa', 'appt_nope', other]) {
      expect(code(await h.tool('appointments_get', { accountId: h.business.id, appointmentId }))).toBe('not_found');
    }
  });

  it('lists a window with names, filters and keyset pagination', async () => {
    const h = nerovaHarness();
    const a = await book(h, 'l1', '09:00');
    await book(h, 'l2', '10:00', { externalStaffId: h.sipho.id, client: { name: 'Other', phone: '+27829999999' } });
    const c = await book(h, 'l3', '11:00');
    const base = { accountId: h.business.id, from: sast('00:00'), to: sast('23:59') };

    const all = await h.ok('appointments_list', base);
    expect(all.items.map((i: { startTime: string }) => i.startTime)).toEqual([sast('09:00'), sast('10:00'), sast('11:00')]);
    expect(all.items[0]).toMatchObject({ serviceName: 'Cut', staffName: 'Thandi', clientName: 'Nadia', clientPhone: '+27821234567', status: 'Scheduled' });
    expect(all).not.toHaveProperty('nextCursor');

    const byStaff = await h.ok('appointments_list', { ...base, staffId: h.sipho.id });
    expect(byStaff.items).toHaveLength(1);
    const byPhone = await h.ok('appointments_list', { ...base, clientPhone: '082 123 4567' });
    expect(byPhone.items.map((i: { externalAppointmentId: string }) => i.externalAppointmentId)).toEqual([a.externalAppointmentId, c.externalAppointmentId]);
    const byClient = await h.ok('appointments_list', { ...base, clientId: a.externalClientId });
    expect(byClient.items).toHaveLength(2);
    expect((await h.ok('appointments_list', { ...base, clientPhone: '+27820000000' })).items).toEqual([]);

    const page1 = await h.ok('appointments_list', { ...base, limit: 2 });
    expect(page1.items).toHaveLength(2);
    const page2 = await h.ok('appointments_list', { ...base, limit: 2, cursor: page1.nextCursor });
    expect(page2.items.map((i: { externalAppointmentId: string }) => i.externalAppointmentId)).toEqual([c.externalAppointmentId]);
    expect(page2).not.toHaveProperty('nextCursor');
  });

  it('filters by status', async () => {
    const h = nerovaHarness();
    const a = await book(h, 's1', '09:00');
    await book(h, 's2', '10:00');
    await h.ok('appointments_cancel', { accountId: h.business.id, appointmentId: a.externalAppointmentId });
    const base = { accountId: h.business.id, from: sast('00:00'), to: sast('23:59') };
    expect((await h.ok('appointments_list', { ...base, status: 'Cancelled' })).items).toHaveLength(1);
    expect((await h.ok('appointments_list', { ...base, status: 'Scheduled' })).items).toHaveLength(1);
    expect((await h.ok('appointments_list', { ...base, status: 'NoShow' })).items).toHaveLength(0);
  });

  it('never returns another business\'s appointments', async () => {
    const h = nerovaHarness();
    await book(h, 'iso', '09:00');
    const second = h.repo.nextId();
    h.repo.tables.businesses.push({ ...h.business, id: second, clerk_org_id: 'o2', slug: 's2' });
    h.plans.set(second, 'growth');
    const { items } = await h.ok('appointments_list', { accountId: second, from: sast('00:00'), to: sast('23:59') });
    expect(items).toEqual([]);
  });

  it('validates the window, phone and cursor', async () => {
    const h = nerovaHarness();
    const base = { accountId: h.business.id, from: sast('00:00'), to: sast('23:59') };
    expect(code(await h.tool('appointments_list', { ...base, to: sast('00:00', '2026-11-30') }))).toBe('invalid_request');
    expect(code(await h.tool('appointments_list', { ...base, from: base.to, to: base.from }))).toBe('invalid_request');
    expect(code(await h.tool('appointments_list', { ...base, clientPhone: 'abc' }))).toBe('invalid_request');
    expect(code(await h.tool('appointments_list', { ...base, cursor: 'bogus' }))).toBe('invalid_request');
    expect(code(await h.tool('appointments_list', { ...base, status: 'Done' }))).toBe('invalid_request');
    expect(code(await h.tool('appointments_list', { ...base, limit: 500 }))).toBe('invalid_request');
    expect(WED).toBe('2026-09-30');
  });
});

describe('availability_search load', () => {
  it('queries at most four days at a time and keeps the results in date order', async () => {
    let inFlight = 0;
    let peak = 0;
    const h = nerovaHarness({
      wrapBooking: (real) => ({
        ...real,
        async listAvailableSlots(query) {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          try {
            return await real.listAvailableSlots(query);
          } finally {
            inFlight -= 1;
          }
        },
      }),
    });
    const { data } = await h.ok('availability_search', {
      accountId: h.business.id, serviceId: h.cut.id, start: sast('00:00', '2026-09-30'), end: sast('00:00', '2026-10-25'),
    });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    const starts = data.map((s: { startTime: string }) => s.startTime);
    expect(starts).toEqual([...starts].sort());
  });
});
