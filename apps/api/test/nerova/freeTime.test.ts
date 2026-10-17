import { describe, expect, it } from 'vitest';

import { declaredToolCapabilities } from '@booking/companion/connector/capabilities.ts';
import definitions from '@booking/companion/connector/booking-connector.mcp-tools.json' with { type: 'json' };
import { sast, WED } from '../booking/fixtures.ts';
import { nerovaHarness } from './harness.ts';

const code = (r: { structuredContent: { code?: string } }) => r.structuredContent.code;
const UNKNOWN = '00000000-0000-4000-8000-0000000000aa';
const window = { start: sast('00:00'), end: sast('23:59') };

type Entry = { externalStaffId: string; windows: { startTime: string; endTime: string }[] };

describe('availability_free_time', () => {
  it('returns one entry per active bookable staff member in the contract shape', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('availability_free_time', { accountId: h.business.id, ...window });
    const ids = (data as Entry[]).map((e) => e.externalStaffId).sort();
    expect(ids).toEqual([h.thandi.id, h.sipho.id].sort());
    expect(ids).not.toContain(h.off.id);
    const thandi = (data as Entry[]).find((e) => e.externalStaffId === h.thandi.id)!;
    // Fixture: open 09:00-17:00 with a 12:00-13:00 lunch.
    expect(thandi.windows).toEqual([
      { startTime: sast('09:00'), endTime: sast('12:00') },
      { startTime: sast('13:00'), endTime: sast('17:00') },
    ]);
  });

  it('subtracts a live booking, and only for that staff member', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', {
      accountId: h.business.id, idempotencyKey: 'ft-1', externalServiceId: h.cut.id, externalStaffId: h.thandi.id,
      startTime: sast('10:00'), client: { name: 'Zed', phone: '+27821110000' },
    });
    const { data } = await h.ok('availability_free_time', { accountId: h.business.id, ...window });
    const byId = new Map((data as Entry[]).map((e) => [e.externalStaffId, e.windows]));
    expect(byId.get(h.thandi.id)).toEqual([
      { startTime: sast('09:00'), endTime: sast('10:00') },
      { startTime: sast('11:00'), endTime: sast('12:00') },
      { startTime: sast('13:00'), endTime: sast('17:00') },
    ]);
    expect(byId.get(h.sipho.id)).toHaveLength(2);
  });

  it('filters by staffId and drops windows below minimumMinutes (default 15)', async () => {
    const h = nerovaHarness();
    const only = await h.ok('availability_free_time', { accountId: h.business.id, staffId: h.sipho.id, ...window });
    expect(only.data.map((e: Entry) => e.externalStaffId)).toEqual([h.sipho.id]);

    h.repo.tables.staff_time_off.push({
      id: h.repo.nextId(), business_id: h.business.id, staff_id: h.thandi.id, starts_on: WED, ends_on: WED,
      start_time: '09:10', end_time: '16:50', reason: 'other', note: null,
    });
    const base = { accountId: h.business.id, staffId: h.thandi.id, ...window };
    // 12:00-13:00 lunch sits inside the time off, leaving 09:00-09:10 and 16:50-17:00 (10 minutes each).
    expect((await h.ok('availability_free_time', base)).data[0].windows).toEqual([]);
    expect((await h.ok('availability_free_time', { ...base, minimumMinutes: 10 })).data[0].windows).toHaveLength(2);
    expect((await h.ok('availability_free_time', { ...base, minimumMinutes: 11 })).data[0].windows).toEqual([]);
  });

  it('gives a staff member with no free time windows: []', async () => {
    const h = nerovaHarness();
    const { data } = await h.ok('availability_free_time', { accountId: h.business.id, start: sast('00:00', '2026-10-03'), end: sast('23:59', '2026-10-03') });
    expect(data).toHaveLength(2);
    for (const e of data as Entry[]) expect(e.windows).toEqual([]);
  });

  it('validates the window, the instants and the staff id', async () => {
    const h = nerovaHarness();
    const base = { accountId: h.business.id };
    expect(code(await h.tool('availability_free_time', { ...base, start: sast('10:00'), end: sast('09:00') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_free_time', { ...base, start: sast('10:00'), end: sast('10:00') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_free_time', { ...base, start: sast('00:00'), end: sast('00:00', '2026-12-01') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_free_time', { ...base, start: 'tomorrow', end: sast('09:00') }))).toBe('invalid_request');
    expect(code(await h.tool('availability_free_time', { ...base, ...window, minimumMinutes: -1 }))).toBe('invalid_request');
    expect(code(await h.tool('availability_free_time', { ...base, ...window, staffId: UNKNOWN }))).toBe('not_found');
    expect(code(await h.tool('availability_free_time', { ...base, ...window, staffId: 'nope' }))).toBe('not_found');
    // Exactly 31 days is allowed.
    const ok = await h.tool('availability_free_time', { ...base, start: sast('00:00'), end: sast('00:00', '2026-10-31') });
    expect(ok.isError).toBeUndefined();
  });

  it('is not_found for a Free-plan, unknown or malformed account', async () => {
    const h = nerovaHarness();
    for (const accountId of [h.freeBusinessId, UNKNOWN, 'not-a-uuid']) {
      expect(code(await h.tool('availability_free_time', { accountId, ...window }))).toBe('not_found');
    }
  });

  it('is declared as ReadFreeTime by publishing the tool, and is read-only', () => {
    const published = [...definitions.tools, ...definitions.optionalTools];
    expect(declaredToolCapabilities(published)).toContain('ReadFreeTime');
    expect(declaredToolCapabilities(definitions.tools)).not.toContain('ReadFreeTime');
    expect(definitions.optionalTools.find((t) => t.name === 'availability_free_time')?.annotations).toEqual({ readOnlyHint: true });
  });

  it('contains every availability_search slot, for several services and with bookings in the way', async () => {
    const h = nerovaHarness();
    await h.ok('appointments_create', {
      accountId: h.business.id, idempotencyKey: 'ft-2', externalServiceId: h.colour.id, externalStaffId: h.thandi.id,
      startTime: sast('13:30'), client: { name: 'Nadia', phone: '+27821234567' },
    });
    const range = { start: sast('00:00'), end: sast('00:00', '2026-10-02') };
    const { data: free } = await h.ok('availability_free_time', { accountId: h.business.id, ...range, minimumMinutes: 0 });
    for (const service of [h.cut, h.colour]) {
      const { data: slots } = await h.ok('availability_search', { accountId: h.business.id, serviceId: service.id, ...range });
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots as { startTime: string; endTime: string; externalStaffId: string }[]) {
        const windows = (free as Entry[]).find((e) => e.externalStaffId === slot.externalStaffId)!.windows;
        const inside = windows.some((w) => Date.parse(w.startTime) <= Date.parse(slot.startTime) && Date.parse(slot.endTime) <= Date.parse(w.endTime));
        expect(inside, `${service.name} ${slot.externalStaffId} ${slot.startTime}`).toBe(true);
      }
    }
  });
});
