import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, publicEncrypt, randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { decryptFlowRequest, encryptFlowResponse, FlowDecryptError, invertIv, loadFlowPrivateKey } from '../../src/whatsapp/flows/crypto.ts';
import { FLOW_COPY, handleFlowRequest, type FlowRequest } from '../../src/whatsapp/flows/handler.ts';
import { signFlowToken, verifyFlowToken } from '../../src/whatsapp/flows/token.ts';
import { signMetaBody } from '../../src/whatsapp/signature.ts';
import { appHarness, appointment, CUSTOMER_PHONE, harness, NOW, STAFF_ALEX, STAFF_SAM, SVC_COLOUR, SVC_CUT, type Harness } from './fakes.ts';

const CONV = '00000000-0000-4000-8000-00000000c0c0';
const ATTEMPT = '00000000-0000-4000-8000-0000000a7777';
const SECRET = 'flow-secret';

let keys: { privatePem: string; publicPem: string };

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  keys = { privatePem: pair.privateKey, publicPem: pair.publicKey };
});

/** What Meta's client does: fresh AES-128 key + IV, RSA-OAEP(SHA-256) wrap, AES-GCM body. */
function encryptRequest(payload: unknown, publicPem = keys.publicPem) {
  const aesKey = randomBytes(16);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-128-gcm', aesKey, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return {
    aesKey,
    iv,
    request: {
      encrypted_flow_data: body.toString('base64'),
      encrypted_aes_key: publicEncrypt({ key: publicPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey).toString('base64'),
      initial_vector: iv.toString('base64'),
    },
  };
}

function decryptResponse(b64: string, aesKey: Buffer, iv: Buffer): unknown {
  const raw = Buffer.from(b64, 'base64');
  const decipher = createDecipheriv('aes-128-gcm', aesKey, invertIv(iv));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString('utf8'));
}

describe('flow crypto', () => {
  it('round-trips a request and answers with the inverted IV', () => {
    const { request, aesKey, iv } = encryptRequest({ action: 'ping', version: '3.0' });
    const key = loadFlowPrivateKey(keys.privatePem);
    const decrypted = decryptFlowRequest(request, key);
    expect(decrypted.payload).toEqual({ action: 'ping', version: '3.0' });
    expect(decrypted.aesKey.equals(aesKey)).toBe(true);
    const response = encryptFlowResponse({ data: { status: 'active' } }, decrypted.aesKey, decrypted.iv);
    expect(decryptResponse(response, aesKey, iv)).toEqual({ data: { status: 'active' } });
  });

  it('inverts every IV bit', () => {
    expect([...invertIv(Buffer.from([0x00, 0xff, 0x0f]))]).toEqual([0xff, 0x00, 0xf0]);
  });

  it('accepts a PEM with escaped newlines and a passphrase', () => {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'pw' },
    });
    const key = loadFlowPrivateKey(pair.privateKey.replace(/\n/g, '\\n'), 'pw');
    const { request } = encryptRequest({ ok: 1 }, pair.publicKey);
    expect(decryptFlowRequest(request, key).payload).toEqual({ ok: 1 });
  });

  it.each([
    ['a tampered body', (r: Record<string, string>) => ({ ...r, encrypted_flow_data: Buffer.from('x'.repeat(40)).toString('base64') })],
    ['a key for someone else', () => encryptRequest({ a: 1 }, generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()).request],
    ['garbage', () => ({ encrypted_flow_data: '', encrypted_aes_key: 'AAAA', initial_vector: '' })],
  ])('rejects %s', (_label, mutate) => {
    const { request } = encryptRequest({ a: 1 });
    expect(() => decryptFlowRequest(mutate(request as unknown as Record<string, string>) as never, loadFlowPrivateKey(keys.privatePem))).toThrow(
      FlowDecryptError,
    );
  });
});

describe('flow token', () => {
  const token = () => signFlowToken(SECRET, { conversationId: CONV, subject: ATTEMPT, now: NOW });

  it('has the documented shape and verifies', () => {
    expect(token()).toMatch(/^v1\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d+\.[0-9a-f]{64}$/);
    expect(verifyFlowToken(SECRET, token(), NOW)).toEqual({
      ok: true,
      claims: { conversationId: CONV, kind: 'booking', attemptId: ATTEMPT, appointmentId: null, expiresAt: NOW.getTime() / 1000 + 86400 },
    });
  });

  it('carries a reschedule subject', () => {
    const t = signFlowToken(SECRET, { conversationId: CONV, subject: `rs-${ATTEMPT}`, now: NOW });
    const check = verifyFlowToken(SECRET, t, NOW);
    expect(check.ok && check.claims).toMatchObject({ kind: 'reschedule', appointmentId: ATTEMPT, attemptId: null });
  });

  it.each([
    ['tampered conversation', (t: string) => t.replace(CONV, '00000000-0000-4000-8000-00000000dead'), 'signature'],
    ['tampered expiry', (t: string) => t.replace(/\.(\d+)\./, (_m, n) => `.${Number(n) + 1}.`), 'signature'],
    ['tampered mac', (t: string) => `${t.slice(0, -1)}${t.endsWith('0') ? '1' : '0'}`, 'signature'],
    ['wrong version', (t: string) => t.replace(/^v1/, 'v2'), 'malformed'],
    ['missing part', (t: string) => t.split('.').slice(1).join('.'), 'malformed'],
    ['non-uuid subject', (t: string) => t.replace(ATTEMPT, 'hello'), 'malformed'],
  ])('rejects a %s', (_label, mutate, reason) => {
    expect(verifyFlowToken(SECRET, mutate(token()), NOW)).toEqual({ ok: false, reason });
  });

  it('rejects another secret, non-strings and expired tokens', () => {
    expect(verifyFlowToken('other', token(), NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyFlowToken(SECRET, 42, NOW)).toEqual({ ok: false, reason: 'malformed' });
    const later = new Date(NOW.getTime() + 25 * 3600_000);
    expect(verifyFlowToken(SECRET, token(), later)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyFlowToken(SECRET, token(), later, { allowExpired: true }).ok).toBe(true);
  });
});

// ---------------------------------------------------------------- data exchange

async function setup(opts: { rules?: Partial<Harness['world']['business']['booking_rules']> } = {}) {
  const h = harness();
  Object.assign(h.world.business.booking_rules, opts.rules ?? {});
  const client = await h.repo.upsertClientByPhone(h.world.business.id, CUSTOMER_PHONE, null);
  const conv = await h.repo.getOrCreateConversation(h.world.business.id, client.id);
  await h.repo.startAttempt({ id: ATTEMPT, businessId: h.world.business.id, clientId: client.id, conversationId: conv.id, at: NOW.toISOString() });
  const token = signFlowToken(SECRET, { conversationId: conv.id, subject: ATTEMPT, now: NOW });
  const ask = (req: FlowRequest) => handleFlowRequest(h.deps, { version: '3.0', flow_token: token, ...req });
  return { h, client, conv, token, ask };
}

const dataOf = (r: Awaited<ReturnType<typeof handleFlowRequest>>) => (r.status === 200 ? (r.body as { screen?: string; data: Record<string, any> }) : null);

describe('flows: booking data exchange', () => {
  it('answers ping without a token', async () => {
    const h = harness();
    expect(await handleFlowRequest(h.deps, { action: 'ping', version: '3.0' })).toEqual({ status: 200, body: { data: { status: 'active' } } });
  });

  it('returns 427 for missing, forged or expired tokens', async () => {
    const { h, token } = await setup();
    expect((await handleFlowRequest(h.deps, { action: 'INIT' })).status).toBe(427);
    expect((await handleFlowRequest(h.deps, { action: 'INIT', flow_token: `${token}x` })).status).toBe(427);
    h.clock.now = new Date(NOW.getTime() + 2 * 86400_000);
    expect((await handleFlowRequest(h.deps, { action: 'INIT', flow_token: token })).status).toBe(427);
  });

  it('walks SERVICE → STAFF → DATE → SLOT → DETAILS → SUMMARY → SUCCESS', async () => {
    const { h, ask, token, client } = await setup();

    const init = dataOf(await ask({ action: 'INIT' }))!;
    expect(init.screen).toBe('SERVICE');
    expect(init.data.services.map((s: { id: string }) => s.id)).toEqual([SVC_CUT, SVC_COLOUR]);

    const staff = dataOf(await ask({ action: 'data_exchange', screen: 'SERVICE', data: { service_id: SVC_CUT } }))!;
    expect(staff.screen).toBe('STAFF');
    expect(staff.data.staff.map((s: { id: string }) => s.id)).toEqual(['any', STAFF_SAM, STAFF_ALEX]);

    const date = dataOf(await ask({ action: 'data_exchange', screen: 'STAFF', data: { service_id: SVC_CUT, staff_id: STAFF_SAM } }))!;
    expect(date).toMatchObject({ screen: 'DATE', data: { min_date: '2026-09-29', max_date: '2026-10-01', unavailable_dates: [] } });

    const slot = dataOf(await ask({ action: 'data_exchange', screen: 'DATE', data: { service_id: SVC_CUT, staff_id: STAFF_SAM, date: '2026-09-29' } }))!;
    expect(slot.screen).toBe('SLOT');
    expect(slot.data.slots.map((s: { title: string }) => s.title)).toEqual(['09:00', '10:00']);
    const slotId = slot.data.slots[0].id as string;
    expect(slotId).toBe(`slot:2026-09-29T07:00:00.000Z|${STAFF_SAM}`);

    const sel = { service_id: SVC_CUT, staff_id: STAFF_SAM, date: '2026-09-29', slot: slotId };
    const details = dataOf(await ask({ action: 'data_exchange', screen: 'SLOT', data: sel }))!;
    expect(details).toMatchObject({ screen: 'DETAILS', data: { name: '', email: '' } });

    const summary = dataOf(await ask({ action: 'data_exchange', screen: 'DETAILS', data: { ...sel, name: 'Thandi', email: '' } }))!;
    expect(summary.screen).toBe('SUMMARY');
    expect(summary.data.summary).toContain('Service: Haircut');
    expect(summary.data.summary).toContain('With: Sam');

    const done = dataOf(await ask({ action: 'data_exchange', screen: 'SUMMARY', data: { ...sel, name: 'Thandi', email: 'thandi@example.com' } }))!;
    expect(done.screen).toBe('SUCCESS');
    const params = done.data.extension_message_response.params;
    expect(params).toMatchObject({ flow_token: token, flow: 'booking' });

    const created = h.world.calls.filter((c) => c.method === 'createAppointment');
    expect(created).toHaveLength(1);
    expect(created[0]!.args).toMatchObject({
      staffId: STAFF_SAM,
      startsAt: '2026-09-29T07:00:00.000Z',
      source: 'whatsapp',
      idempotencyKey: `wa-flow:${token}:${slotId}`,
      actor: { type: 'customer', id: client.id },
      notifyCustomer: false,
    });
    expect(params.appointment_id).toBe(h.world.appointments[0]!.id);
    expect(h.repo.db.clients[0]).toMatchObject({ name: 'Thandi', email: 'thandi@example.com' });
    const attempt = h.repo.db.attempts[0]!;
    expect(attempt.outcome).toBe('completed');
    expect(attempt.steps.map((s) => s.step)).toEqual(['flow:SERVICE', 'flow:STAFF', 'flow:DATE', 'flow:SLOT', 'flow:DETAILS', 'flow:SUMMARY', 'flow:SUCCESS']);

    // Meta retries the SUMMARY request: same appointment, no second booking.
    const again = dataOf(await ask({ action: 'data_exchange', screen: 'SUMMARY', data: { ...sel, name: 'Thandi', email: '' } }))!;
    expect(again.data.extension_message_response.params.appointment_id).toBe(params.appointment_id);
    expect(h.world.appointments).toHaveLength(1);
  });

  it('skips STAFF when one person does the service', async () => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'SERVICE', data: { service_id: SVC_COLOUR } }))!;
    expect(r).toMatchObject({ screen: 'DATE', data: { service_id: SVC_COLOUR, staff_id: 'any' } });
  });

  it('lists gaps between open dates as unavailable', async () => {
    const { h, ask } = await setup();
    h.world.days = ['2026-09-29', '2026-10-02'];
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'STAFF', data: { service_id: SVC_CUT, staff_id: 'any' } }))!;
    expect(r.data).toMatchObject({ min_date: '2026-09-29', max_date: '2026-10-02', unavailable_dates: ['2026-09-30', '2026-10-01'] });
  });

  it('keeps the customer on SLOT with a refreshed list when the slot is gone', async () => {
    const { h, ask } = await setup();
    const sel = { service_id: SVC_CUT, staff_id: 'any', date: '2026-09-29', slot: 'slot:2026-09-29T07:00:00.000Z|any' };
    h.world.slots['2026-09-29'] = h.world.slots['2026-09-29']!.slice(1);
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'SLOT', data: sel }))!;
    expect(r).toMatchObject({ screen: 'SLOT', data: { error_message: FLOW_COPY.slotTaken } });
    expect(r.data.slots).toHaveLength(1);
  });

  it('reports SLOT_UNAVAILABLE on SUMMARY and leaves the attempt open', async () => {
    const { h, ask } = await setup();
    h.world.taken.add('2026-09-29T07:00:00.000Z');
    const sel = { service_id: SVC_CUT, staff_id: 'any', date: '2026-09-29', slot: 'slot:2026-09-29T07:00:00.000Z|any', name: 'T' };
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'SUMMARY', data: sel }))!;
    expect(r).toEqual({ screen: 'SUMMARY', data: { error_message: FLOW_COPY.slotTakenBack } });
    expect(h.repo.db.attempts[0]!.outcome).toBe('in_progress');
  });

  it.each([
    ['unknown service', 'SERVICE', { service_id: '00000000-0000-4000-8000-000000000999' }, 'SERVICE'],
    ['staff not qualified', 'STAFF', { service_id: SVC_COLOUR, staff_id: STAFF_ALEX }, 'STAFF'],
    ['slot for another staff member', 'SUMMARY', { service_id: SVC_CUT, staff_id: STAFF_SAM, date: '2026-09-29', slot: 'slot:2026-09-29T07:00:00.000Z|any', name: 'T' }, 'SUMMARY'],
    ['slot on another date', 'SUMMARY', { service_id: SVC_CUT, staff_id: 'any', date: '2026-09-30', slot: 'slot:2026-09-29T07:00:00.000Z|any', name: 'T' }, 'SUMMARY'],
    ['missing name', 'SUMMARY', { service_id: SVC_CUT, staff_id: 'any', date: '2026-09-29', slot: 'slot:2026-09-29T07:00:00.000Z|any', name: ' ' }, 'SUMMARY'],
    ['bad email', 'DETAILS', { service_id: SVC_CUT, staff_id: 'any', date: '2026-09-29', slot: 'slot:2026-09-29T07:00:00.000Z|any', name: 'T', email: 'nope' }, 'DETAILS'],
    ['malformed fields', 'DATE', { service_id: SVC_CUT, date: '2026-02-31' }, 'DATE'],
  ])('rejects %s and stays on the screen', async (_label, screen, data, expected) => {
    const { h, ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen, data }))!;
    expect(r.screen).toBe(expected);
    expect(r.data.error_message).toBeTruthy();
    expect(h.world.appointments).toHaveLength(0);
  });

  it('acknowledges client error notifications and escalates flow_error', async () => {
    const { h, ask } = await setup();
    const r = await ask({ action: 'data_exchange', screen: 'SLOT', data: { error: 'INVALID_SCREEN', error_message: 'x' } });
    expect(r).toEqual({ status: 200, body: { data: { acknowledged: true } } });
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'flow_error' }]);
  });

  it('restarts at SERVICE on BACK', async () => {
    const { ask } = await setup();
    expect(dataOf(await ask({ action: 'BACK', screen: 'DATE' }))!.screen).toBe('SERVICE');
  });
});

describe('flows: reschedule data exchange', () => {
  async function rescheduleSetup(startsAt = '2026-10-05T07:00:00.000Z') {
    const s = await setup();
    const appt = appointment({ id: '00000000-0000-4000-8000-00000000aaaa', client_id: s.client.id, starts_at: startsAt });
    s.h.world.appointments.push(appt);
    const token = signFlowToken(SECRET, { conversationId: s.conv.id, subject: `rs-${appt.id}`, now: NOW });
    const ask = (req: FlowRequest) => handleFlowRequest(s.h.deps, { version: '3.0', flow_token: token, ...req });
    return { ...s, appt, token, ask };
  }

  it('walks DATE → SLOT → SUMMARY → SUCCESS with the same staff member', async () => {
    const { h, ask, appt } = await rescheduleSetup();
    const date = dataOf(await ask({ action: 'INIT' }))!;
    expect(date).toMatchObject({ screen: 'DATE', data: { service_id: SVC_CUT, staff_id: STAFF_SAM } });
    const sel = { service_id: SVC_CUT, staff_id: STAFF_SAM, date: '2026-09-30' };
    const slots = dataOf(await ask({ action: 'data_exchange', screen: 'DATE', data: sel }))!;
    const slotId = slots.data.slots[0].id as string;
    const summary = dataOf(await ask({ action: 'data_exchange', screen: 'SLOT', data: { ...sel, slot: slotId } }))!;
    expect(summary.screen).toBe('SUMMARY');
    const done = dataOf(await ask({ action: 'data_exchange', screen: 'SUMMARY', data: { ...sel, slot: slotId } }))!;
    expect(done.data.extension_message_response.params).toMatchObject({ flow: 'reschedule', appointment_id: appt.id });
    expect(h.world.appointments[0]!.starts_at).toBe('2026-09-30T07:00:00.000Z');
    // Retried SUMMARY after success answers the same, without a second call.
    await ask({ action: 'data_exchange', screen: 'SUMMARY', data: { ...sel, slot: slotId } });
    expect(h.world.calls.filter((c) => c.method === 'rescheduleAppointment')).toHaveLength(1);
  });

  it('reports the cancellation window instead of moving', async () => {
    const { ask } = await rescheduleSetup('2026-09-28T20:00:00.000Z');
    const r = dataOf(
      await ask({ action: 'data_exchange', screen: 'SUMMARY', data: { service_id: SVC_CUT, staff_id: STAFF_SAM, date: '2026-09-30', slot: `slot:2026-09-30T07:00:00.000Z|${STAFF_SAM}` } }),
    )!;
    expect(r.data.error_message).toBe(FLOW_COPY.window);
  });

  it('closes the flow (427) for a cancelled appointment', async () => {
    const { h, ask } = await rescheduleSetup();
    h.world.appointments[0]!.status = 'cancelled';
    expect((await ask({ action: 'INIT' })).status).toBe(427);
  });
});

describe('flows: HTTP endpoint', () => {
  function endpoint() {
    const h = appHarness({ env: { WHATSAPP_FLOW_PRIVATE_KEY: keys.privatePem } });
    const post = async (body: string, headers: Record<string, string> = {}) => {
      const res = await h.app.request('/flows/whatsapp', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
      return { status: res.status, text: await res.text() };
    };
    return { h, post };
  }

  it('encrypts the ping response with the inverted IV', async () => {
    const { post } = endpoint();
    const { request, aesKey, iv } = encryptRequest({ action: 'ping', version: '3.0' });
    const r = await post(JSON.stringify(request));
    expect(r.status).toBe(200);
    expect(decryptResponse(r.text, aesKey, iv)).toEqual({ data: { status: 'active' } });
  });

  it('answers 421 when the body cannot be decrypted', async () => {
    const { post } = endpoint();
    expect((await post(JSON.stringify({ encrypted_flow_data: 'x', encrypted_aes_key: 'y', initial_vector: 'z' }))).status).toBe(421);
    expect((await post('not json')).status).toBe(421);
  });

  it('answers 427 for an invalid flow token', async () => {
    const { post } = endpoint();
    const { request } = encryptRequest({ action: 'INIT', version: '3.0', flow_token: 'v1.bad' });
    expect((await post(JSON.stringify(request))).status).toBe(427);
  });

  it('answers 432 when a request signature is present and wrong, and accepts a right one', async () => {
    const { post } = endpoint();
    const { request } = encryptRequest({ action: 'ping', version: '3.0' });
    const body = JSON.stringify(request);
    expect((await post(body, { 'x-hub-signature-256': 'sha256=00' })).status).toBe(432);
    expect((await post(body, { 'x-hub-signature-256': signMetaBody('app-secret', body) })).status).toBe(200);
  });
});
