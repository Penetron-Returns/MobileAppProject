import { describe, expect, it } from 'vitest';

import { harness, type Harness } from './harness.ts';
import { sast } from './fixtures.ts';

const TODAY = '2026-09-28'; // the harness clock: Monday 08:00 SAST
const PATH = '/v1/voice/today';
const keyOf = (n: number) => `voice-today-key-${String(n).padStart(6, '0')}`;

async function book(h: Harness, hhmm: string, date = TODAY): Promise<string> {
  const res = await h.call('POST', '/v1/appointments', {
    body: { client_id: h.client.id, service_id: h.cut.id, staff_id: h.thandi.id, starts_at: sast(hhmm, date) },
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data.id;
}

async function deviceToken(h: Harness, as: 'owner' | 'staff' = 'owner'): Promise<string> {
  const res = await h.call('POST', '/v1/voice/device-token', { token: as, body: {} });
  return res.body.data.token;
}

const withDevice = (token: string) => ({ token: null, headers: { authorization: `Bearer ${token}` } }) as const;

describe('GET /v1/voice/today', () => {
  it("returns today's appointments in the business-local day with minimal fields", async () => {
    const h = harness();
    h.client.name = 'Nadia Khumalo';
    const id = await book(h, '10:00');
    await book(h, '10:00', '2026-09-29'); // tomorrow
    const res = await h.call('GET', PATH);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      timezone: 'Africa/Johannesburg',
      appointments: [
        {
          id,
          starts_at: sast('10:00', TODAY),
          ends_at: sast('11:00', TODAY),
          status: 'confirmed',
          checked_in_at: null,
          staff_id: h.thandi.id,
          client_first_name: 'Nadia',
          service_name: h.cut.name,
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Khumalo|\+27|phone/);
  });

  it('leaves out cancelled appointments and uses the day boundaries of the business zone', async () => {
    const h = harness();
    const gone = await book(h, '10:00');
    h.repo.tables.appointments.find((a) => a.id === gone)!.status = 'cancelled';
    const kept = await book(h, '14:00');
    const rows = (await h.call('GET', PATH)).body.data.appointments;
    expect(rows.map((r: { id: string }) => r.id)).toEqual([kept]);
  });

  it('works for staff and needs a session', async () => {
    const h = harness();
    expect((await h.call('GET', PATH, { token: 'staff' })).status).toBe(200);
    expect((await h.call('GET', PATH, { token: null })).status).toBe(401);
  });

  it("is scoped to the token's business and refuses other business ids", async () => {
    const h = harness();
    await book(h, '10:00');
    const res = await h.call('GET', `${PATH}?business_id=00000000-0000-4000-8000-000000000000`);
    expect(res.body.data.appointments).toHaveLength(1);
  });
});

describe('device voice token on the voice check-in routes', () => {
  it("reads today's appointments and checks the client in", async () => {
    const h = harness();
    const id = await book(h, '10:00');
    const token = await deviceToken(h);
    const today = await h.call('GET', PATH, withDevice(token));
    expect(today.status).toBe(200);
    expect(today.body.data.appointments.map((a: { id: string }) => a.id)).toEqual([id]);
    const checkIn = await h.call('POST', `/v1/appointments/${id}/check-in`, { ...withDevice(token), body: {}, key: keyOf(1) });
    expect(checkIn.status).toBe(200);
    expect(h.repo.tables.appointments.find((a) => a.id === id)!.checked_in_at).not.toBeNull();
  });

  it('is refused once the member is removed', async () => {
    const h = harness();
    const token = await deviceToken(h, 'staff');
    h.voiceTokenRepo.removeMember({ businessId: h.business.id, userId: 'user_staff' });
    expect((await h.call('GET', PATH, withDevice(token))).status).toBe(401);
  });

  it.each([
    ['GET', '/v1/appointments'],
    ['GET', '/v1/voice/today/extra'],
    ['POST', '/v1/voice/today'],
    ['GET', '/v1/clients'],
  ])('still refuses it on %s %s', async (method, path) => {
    const h = harness();
    const token = await deviceToken(h);
    const res = await h.call(method, path, { ...withDevice(token), key: keyOf(2) });
    expect(res.status).toBe(401);
  });
});
