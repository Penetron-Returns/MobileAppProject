import { beforeEach, describe, expect, it } from 'vitest';

import { sast, WED } from './fixtures';
import { harness, type Harness } from './harness';

let h: Harness;
beforeEach(() => {
  h = harness();
});

describe('auth and roles', () => {
  it('rejects bad tokens and sessions without an organisation', async () => {
    expect((await h.call('GET', '/v1/me', { token: 'bad' })).status).toBe(401);
    const noOrg = await h.call('GET', '/v1/me', { token: 'noorg' });
    expect(noOrg.status).toBe(403);
    expect(noOrg.body.error.code).toBe('NO_BUSINESS');
  });

  it('keeps owner-only routes from staff', async () => {
    for (const [method, path, body] of [
      ['PATCH', '/v1/business', { name: 'X' }],
      ['PUT', '/v1/business/hours', { hours: [] }],
      ['POST', '/v1/services', { name: 'X', duration_minutes: 30, price_cents: 0 }],
      ['DELETE', `/v1/staff/${h.sipho.id}`, undefined],
      ['POST', '/v1/overrides', { date: WED, is_closed: true }],
    ] as const) {
      const res = await h.call(method, path, { token: 'staff', body });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('lets staff use member routes', async () => {
    expect((await h.call('GET', `/v1/availability/slots?service_id=${h.cut.id}&date=${WED}`, { token: 'staff' })).status).toBe(200);
    expect((await h.call('POST', '/v1/clients', { token: 'staff', body: { phone: '0831112222' } })).status).toBe(201);
  });

  it('requires an Idempotency-Key on mutations', async () => {
    const res = await h.call('POST', '/v1/clients', { key: null, body: { phone: '0831112222' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('me and business', () => {
  it('returns the caller, business and role', async () => {
    h.repo.tables.users.push({
      id: 'user_owner',
      business_id: h.business.id,
      role: 'owner',
      email: 'o@example.com',
      display_name: 'Owner',
      avatar_url: null,
    });
    const res = await h.call('GET', '/v1/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      user: { id: 'user_owner', email: 'o@example.com', display_name: 'Owner' },
      business: { id: h.business.id, slug: 'salon', timezone: 'Africa/Johannesburg' },
      role: 'owner',
    });
  });

  it('patches details and merges booking rules', async () => {
    const res = await h.call('PATCH', '/v1/business', {
      body: { name: 'New Salon', phone: '021 555 1234', booking_rules: { buffer_minutes: 10 } },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Salon');
    expect(res.body.data.phone).toBe('+27215551234');
    expect(res.body.data.booking_rules).toMatchObject({ buffer_minutes: 10, slot_interval_minutes: 30, lead_time_minutes: 0 });
  });

  it('validates business fields', async () => {
    for (const body of [{ timezone: 'Mars/Base' }, { slug: 'Not A Slug' }, { booking_rules: { slot_interval_minutes: 1 } }]) {
      const res = await h.call('PATCH', '/v1/business', { body });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('replaces business hours', async () => {
    const res = await h.call('PUT', '/v1/business/hours', {
      body: { hours: [{ weekday: 6, opens_at: '08:00', closes_at: '13:00:00' }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.hours).toEqual([{ weekday: 6, opens_at: '08:00', closes_at: '13:00' }]);
    const bad = await h.call('PUT', '/v1/business/hours', { body: { hours: [{ weekday: 1, opens_at: '17:00', closes_at: '09:00' }] } });
    expect(bad.status).toBe(400);
  });
});

describe('services, staff and overrides', () => {
  it('creates a service linked to staff', async () => {
    const res = await h.call('POST', '/v1/services', {
      body: { name: 'Beard', duration_minutes: 20, price_cents: 8000, staff_ids: [h.sipho.id] },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Beard', is_active: true, deposit_cents: 0, description: null });
    expect(h.repo.tables.staff_services).toContainEqual({ business_id: h.business.id, staff_id: h.sipho.id, service_id: res.body.data.id });
    const unknown = await h.call('POST', '/v1/services', {
      body: { name: 'X', duration_minutes: 20, price_cents: 0, staff_ids: ['00000000-0000-4000-8000-999999999999'] },
    });
    expect(unknown.status).toBe(400);
  });

  it('patches a service and 404s on unknown ids', async () => {
    const res = await h.call('PATCH', `/v1/services/${h.cut.id}`, { body: { price_cents: 12345 } });
    expect(res.body.data.price_cents).toBe(12345);
    expect((await h.call('PATCH', '/v1/services/00000000-0000-4000-8000-999999999999', { body: { name: 'x' } })).status).toBe(404);
    expect((await h.call('PATCH', '/v1/services/not-a-uuid', { body: { name: 'x' } })).status).toBe(400);
  });

  it('hard-deletes unreferenced services and soft-deletes referenced ones', async () => {
    const hard = await h.call('DELETE', `/v1/services/${h.colour.id}`);
    expect(hard.body.data).toEqual({ id: h.colour.id, deleted: true });
    expect(h.repo.tables.services.some((s) => s.id === h.colour.id)).toBe(false);

    await h.call('POST', '/v1/appointments', { body: { client_id: h.client.id, service_id: h.cut.id, starts_at: sast('09:00') } });
    const soft = await h.call('DELETE', `/v1/services/${h.cut.id}`);
    expect(soft.body.data).toEqual({ id: h.cut.id, deleted: false });
    expect(h.repo.tables.services.find((s) => s.id === h.cut.id)!.is_active).toBe(false);
  });

  it('manages staff, their services and availability', async () => {
    const created = await h.call('POST', '/v1/staff', { body: { name: 'Lerato', phone: '0825550000', service_ids: [h.cut.id] } });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ phone: '+27825550000', accepts_bookings: true, user_id: null });

    const services = await h.call('PUT', `/v1/staff/${id}/services`, { body: { service_ids: [h.cut.id, h.colour.id] } });
    expect(services.body.data).toEqual({ staff_id: id, service_ids: [h.cut.id, h.colour.id] });
    expect((await h.call('PUT', `/v1/staff/${id}/services`, { body: { service_ids: ['00000000-0000-4000-8000-999999999999'] } })).status).toBe(400);

    const avail = await h.call('PUT', `/v1/staff/${id}/availability`, {
      body: { rules: [{ weekday: 3, start_time: '10:00', end_time: '11:00' }] },
    });
    expect(avail.status).toBe(200);
    const slots = await h.call('GET', `/v1/availability/slots?service_id=${h.cut.id}&date=${WED}&staff_id=${id}`);
    expect(slots.body.data.slots.map((s: { starts_at: string }) => s.starts_at)).toEqual([sast('10:00')]);

    const patched = await h.call('PATCH', `/v1/staff/${id}`, { body: { title: 'Senior' } });
    expect(patched.body.data.title).toBe('Senior');
    expect((await h.call('DELETE', `/v1/staff/${id}`)).body.data).toEqual({ id, deleted: true });
    expect((await h.call('PUT', `/v1/staff/${id}/availability`, { body: { rules: [] } })).status).toBe(404);
  });

  it('creates and deletes overrides that shape availability', async () => {
    const created = await h.call('POST', '/v1/overrides', { body: { date: WED, is_closed: true, reason: 'Holiday' } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ date: WED, is_closed: true, staff_id: null, start_time: null });
    const closed = await h.call('GET', `/v1/availability/slots?service_id=${h.cut.id}&date=${WED}`);
    expect(closed.body.data.slots).toEqual([]);

    expect((await h.call('DELETE', `/v1/overrides/${created.body.data.id}`)).status).toBe(200);
    expect((await h.call('DELETE', `/v1/overrides/${created.body.data.id}`)).status).toBe(404);

    const open = await h.call('POST', '/v1/overrides', { body: { date: WED, is_closed: false, start_time: '10:00' } });
    expect(open.status).toBe(400);
  });
});

describe('clients', () => {
  it('normalises phones and upserts by phone', async () => {
    const a = await h.call('POST', '/v1/clients', { body: { phone: '083 111 2222', name: 'Ayanda', tags: ['vip'] } });
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ phone_e164: '+27831112222', name: 'Ayanda', tags: ['vip'] });
    const b = await h.call('POST', '/v1/clients', { body: { phone: '+27831112222', email: 'a@example.com' } });
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(b.body.data.email).toBe('a@example.com');
    expect((await h.call('POST', '/v1/clients', { body: { phone: '123' } })).status).toBe(400);
  });

  it('patches clients and rejects duplicate phones', async () => {
    const res = await h.call('PATCH', `/v1/clients/${h.client.id}`, { body: { is_blocked: true, phone: '0821234567' } });
    expect(res.body.data).toMatchObject({ is_blocked: true, phone_e164: '+27821234567' });
    const dup = await h.call('PATCH', `/v1/clients/${h.client.id}`, { body: { phone: h.other.phone_e164 } });
    expect(dup.status).toBe(400);
  });

  it('adds and deletes notes', async () => {
    const note = await h.call('POST', `/v1/clients/${h.client.id}/notes`, { body: { body: 'Allergic to latex', kind: 'warning' } });
    expect(note.status).toBe(201);
    expect(note.body.data).toMatchObject({ client_id: h.client.id, kind: 'warning', created_by: 'user_owner' });
    const del = await h.call('DELETE', `/v1/clients/${h.client.id}/notes/${note.body.data.id}`);
    expect(del.body.data).toEqual({ id: note.body.data.id });
    expect((await h.call('DELETE', `/v1/clients/${h.client.id}/notes/${note.body.data.id}`)).status).toBe(404);
    expect((await h.call('POST', `/v1/clients/00000000-0000-4000-8000-999999999999/notes`, { body: { body: 'x' } })).status).toBe(404);
  });
});

describe('availability', () => {
  it('lists days and slots', async () => {
    const days = await h.call('GET', `/v1/availability/days?service_id=${h.cut.id}&from=2026-09-28&to=2026-10-04`);
    expect(days.body.data.days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    const slots = await h.call('GET', `/v1/availability/slots?service_id=${h.cut.id}&date=${WED}`);
    expect(slots.body.data).toMatchObject({ date: WED, timezone: 'Africa/Johannesburg' });
    expect(slots.body.data.slots[0]).toEqual({ starts_at: sast('09:00'), ends_at: sast('10:00'), staff_ids: [h.thandi.id, h.sipho.id] });
  });

  it('validates queries', async () => {
    expect((await h.call('GET', `/v1/availability/days?service_id=${h.cut.id}&from=2026-09-01&to=2026-12-31`)).status).toBe(400);
    expect((await h.call('GET', `/v1/availability/days?service_id=${h.cut.id}&from=2026-10-01&to=2026-09-01`)).status).toBe(400);
    expect((await h.call('GET', `/v1/availability/slots?service_id=${h.cut.id}&date=2026-02-30`)).status).toBe(400);
    expect((await h.call('GET', `/v1/availability/slots?date=${WED}`)).status).toBe(400);
  });
});

describe('appointments', () => {
  const book = (over: Record<string, unknown> = {}, key?: string) =>
    h.call('POST', '/v1/appointments', {
      body: { client_id: h.client.id, service_id: h.cut.id, starts_at: sast('09:00'), ...over },
      ...(key ? { key } : {}),
    });

  it('creates an appointment and notifies', async () => {
    const res = await book({ notes: 'First visit' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ staff_id: h.thandi.id, source: 'app', notes: 'First visit', starts_at: sast('09:00') });
    expect(h.events).toEqual([expect.objectContaining({ kind: 'created', notifyCustomer: true, actor: { type: 'staff', id: 'user_owner' } })]);
    expect(h.repo.tables.appointments[0]!.idempotency_key).toMatch(/^app:test-key-/);
    expect(h.repo.tables.appointments[0]!.created_by).toBe('user_owner');
  });

  it('replays an identical request with the same Idempotency-Key', async () => {
    const a = await book({}, 'replay-key-0001');
    const b = await book({}, 'replay-key-0001');
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
    expect(b.headers.get('idempotent-replay')).toBe('true');
    expect(h.repo.tables.appointments).toHaveLength(1);
    expect(h.events).toHaveLength(1);
    const reused = await book({ starts_at: sast('10:00') }, 'replay-key-0001');
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('maps a taken slot to 409 SLOT_UNAVAILABLE', async () => {
    await book({ staff_id: h.thandi.id });
    const res = await book({ staff_id: h.thandi.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('maps rule violations to 422 with details.rule', async () => {
    const res = await book({ service_id: h.colour.id, staff_id: h.sipho.id });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { rule: 'STAFF_NOT_QUALIFIED' } });
  });

  it('creates a new client inline', async () => {
    const res = await book({ client_id: undefined, new_client: { phone: '072 000 1111', name: 'Zola', email: 'z@example.com' } });
    expect(res.status).toBe(201);
    const client = h.repo.tables.clients.find((c) => c.id === res.body.data.client_id)!;
    expect(client).toMatchObject({ phone_e164: '+27720001111', name: 'Zola', email: 'z@example.com' });
  });

  it('validates the body', async () => {
    const both = await book({ new_client: { phone: '0720001111' } });
    expect(both.status).toBe(400);
    expect((await book({ starts_at: 'next tuesday' })).status).toBe(400);
    expect((await book({ client_id: '00000000-0000-4000-8000-999999999999' })).status).toBe(404);
    expect((await h.call('POST', '/v1/appointments', { body: '{not json' })).status).toBe(400);
  });

  it('allows walk-ins outside hours', async () => {
    const res = await book({ starts_at: sast('18:00'), allow_outside_hours: true, send_whatsapp_confirmation: false });
    expect(res.status).toBe(201);
    expect(h.events.at(-1)!.notifyCustomer).toBe(false);
  });

  it('runs the full lifecycle', async () => {
    const id = (await book()).body.data.id;
    const moved = await h.call('POST', `/v1/appointments/${id}/reschedule`, { body: { starts_at: sast('14:00'), notify_customer: false } });
    expect(moved.body.data.starts_at).toBe(sast('14:00'));
    const notes = await h.call('PATCH', `/v1/appointments/${id}`, { body: { notes: 'Bring photos' } });
    expect(notes.body.data.notes).toBe('Bring photos');
    const checkedIn = await h.call('POST', `/v1/appointments/${id}/check-in`);
    expect(checkedIn.body.data.checked_in_at).toBeTruthy();
    const done = await h.call('POST', `/v1/appointments/${id}/status`, { body: { status: 'completed' } });
    expect(done.body.data.status).toBe('completed');
    const again = await h.call('POST', `/v1/appointments/${id}/status`, { body: { status: 'no_show' } });
    expect(again.status).toBe(422);
    expect((await h.call('POST', `/v1/appointments/${id}/status`, { body: { status: 'cancelled' } })).status).toBe(400);
  });

  it('cancels with an empty body', async () => {
    const id = (await book()).body.data.id;
    const res = await h.call('POST', `/v1/appointments/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(h.events.at(-1)).toMatchObject({ kind: 'cancelled', notifyCustomer: true });
    expect((await h.call('POST', '/v1/appointments/00000000-0000-4000-8000-999999999999/cancel')).status).toBe(404);
  });

  it('registers push devices', async () => {
    const res = await h.call('POST', '/v1/devices', { body: { token: 'ExponentPushToken[abc]', platform: 'ios' } });
    expect(res.status).toBe(201);
    expect(h.repo.tables.device_push_tokens).toEqual([
      { business_id: h.business.id, user_id: 'user_owner', token: 'ExponentPushToken[abc]', platform: 'ios' },
    ]);
  });
});
