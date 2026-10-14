import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, publicEncrypt, randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { decryptFlowRequest, encryptFlowResponse, FlowDecryptError, invertIv, loadFlowPrivateKey } from '../../src/whatsapp/flows/crypto.ts';
import { FLOW_COPY, handleFlowRequest, type FlowRequest } from '../../src/whatsapp/flows/handler.ts';
import { signFlowToken, verifyFlowToken } from '../../src/whatsapp/flows/token.ts';
import { signMetaBody } from '../../src/whatsapp/signature.ts';
import { appHarness, appointment, CUSTOMER_PHONE, harness, NOW, STAFF_SAM, SVC_COLOUR, SVC_CUT, type Harness } from './fakes.ts';

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
  it('round-trips a request and answers with the inverted IV', async () => {
    const { request, aesKey, iv } = encryptRequest({ action: 'ping', version: '3.0' });
    const key = loadFlowPrivateKey(keys.privatePem);
    const decrypted = await decryptFlowRequest(request, key);
    expect(decrypted.payload).toEqual({ action: 'ping', version: '3.0' });
    expect(decrypted.aesKey.equals(aesKey)).toBe(true);
    const response = await encryptFlowResponse({ data: { status: 'active' } }, decrypted.aesKey, decrypted.iv);
    expect(decryptResponse(response, aesKey, iv)).toEqual({ data: { status: 'active' } });
  });

  it('inverts every IV bit', () => {
    expect([...invertIv(Buffer.from([0x00, 0xff, 0x0f]))]).toEqual([0xff, 0x00, 0xf0]);
  });

  it('accepts a PEM with escaped newlines and a passphrase', async () => {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'pw' },
    });
    const key = loadFlowPrivateKey(pair.privateKey.replace(/\n/g, '\\n'), 'pw');
    const { request } = encryptRequest({ ok: 1 }, pair.publicKey);
    expect((await decryptFlowRequest(request, key)).payload).toEqual({ ok: 1 });
  });

  it.each([
    ['a tampered body', (r: Record<string, string>) => ({ ...r, encrypted_flow_data: Buffer.from('x'.repeat(40)).toString('base64') })],
    ['a key for someone else', () => encryptRequest({ a: 1 }, generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()).request],
    ['garbage', () => ({ encrypted_flow_data: '', encrypted_aes_key: 'AAAA', initial_vector: '' })],
  ])('rejects %s', async (_label, mutate) => {
    const { request } = encryptRequest({ a: 1 });
    await expect(decryptFlowRequest(mutate(request as unknown as Record<string, string>) as never, loadFlowPrivateKey(keys.privatePem))).rejects.toThrow(
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

const T0 = '2026-09-29T07:00:00.000Z';
const T1 = '2026-09-29T08:00:00.000Z';

describe('flows: booking data exchange', () => {
  it('answers ping without a token', async () => {
    const h = harness();
    expect(await handleFlowRequest(h.deps, { action: 'ping', version: '3.0' })).toEqual({ status: 200, body: { version: '3.0', data: { status: 'active' } } });
  });

  it('returns 427 for missing, forged or expired tokens', async () => {
    const { h, token } = await setup();
    expect((await handleFlowRequest(h.deps, { action: 'INIT' })).status).toBe(427);
    expect((await handleFlowRequest(h.deps, { action: 'INIT', flow_token: `${token}x` })).status).toBe(427);
    h.clock.now = new Date(NOW.getTime() + 2 * 86400_000);
    expect((await handleFlowRequest(h.deps, { action: 'INIT', flow_token: token })).status).toBe(427);
  });

  it('INIT serves the SERVICE list with duration and price', async () => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'INIT' }))!;
    expect(r.screen).toBe('SERVICE');
    expect(r.data.service).toEqual([
      { id: SVC_CUT, title: 'Haircut', description: '60 min', metadata: 'R 250' },
      { id: SVC_COLOUR, title: 'Colour', description: '90 min' },
    ]);
  });

  it('service_selected opens DATETIME with the grid hidden and the booking window', async () => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'SERVICE', data: { trigger: 'service_selected', service: SVC_CUT } }))!;
    expect(r.screen).toBe('DATETIME');
    expect(r.data).toEqual({
      service_slug: SVC_CUT,
      selected_service_label: 'Haircut',
      min_date: '2026-09-28',
      max_date: '2026-11-27',
      show_times: false,
      no_times: false,
      selected_date_label: '',
      time: [],
      duration_minutes: 60,
      timezone: 'Africa/Johannesburg',
    });
  });

  it('date_selected reveals the chips for that day, one per start time', async () => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'date_selected', service: SVC_CUT, date: '2026-09-29' } }))!;
    expect(r.data).toMatchObject({ show_times: true, no_times: false, selected_date_label: 'Tuesday, 29 Sep 2026' });
    expect(r.data.time).toEqual([
      { id: T0, title: '09:00' },
      { id: T1, title: '10:00' },
    ]);
  });

  it.each([
    ['a day with no slots', '2026-10-02', true],
    ['a past date', '2026-09-20', true],
    ['a date beyond the horizon', '2027-01-01', true],
    ['a cleared date', '', false],
  ])('date_selected for %s hides the grid', async (_l, date, noTimes) => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'date_selected', service: SVC_CUT, date } }))!;
    expect(r.data).toMatchObject({ show_times: false, no_times: noTimes, time: [] });
  });

  it('caps the chips at the 20 Meta renders', async () => {
    const { h, ask } = await setup();
    h.world.slots['2026-09-29'] = Array.from({ length: 30 }, (_, i) => ({
      starts_at: new Date(Date.parse(T0) + i * 900_000).toISOString(),
      ends_at: T0,
      staff_ids: [STAFF_SAM],
    }));
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'date_selected', service: SVC_CUT, date: '2026-09-29' } }))!;
    expect(r.data.time).toHaveLength(20);
  });

  it('continue re-validates the slot and builds the markdown SUMMARY without booking', async () => {
    const { h, ask } = await setup();
    const r = dataOf(
      await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'continue', service_slug: SVC_CUT, time: [T0], duration_minutes: 60, timezone: 'x' } }),
    )!;
    expect(r.screen).toBe('SUMMARY');
    expect(r.data).toEqual({
      summary_text: '**Haircut**\n\nTuesday, 29 Sep 2026 at **09:00**\n\n_60 min_',
      service_slug: SVC_CUT,
      start_time_iso: T0,
      duration_minutes: 60,
      timezone: 'Africa/Johannesburg',
    });
    // The engine books on the nfm_reply, never this endpoint.
    expect(h.world.calls.filter((c) => c.method === 'createAppointment')).toHaveLength(0);
  });

  it('continue accepts the time as a plain string too', async () => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'continue', service_slug: SVC_CUT, time: T1 } }))!;
    expect(r.screen).toBe('SUMMARY');
  });

  it('continue keeps the customer on DATETIME with fresh chips when the time was taken', async () => {
    const { h, ask } = await setup();
    h.world.slots['2026-09-29'] = h.world.slots['2026-09-29']!.slice(1);
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'continue', service_slug: SVC_CUT, time: [T0] } }))!;
    expect(r.screen).toBe('DATETIME');
    expect(r.data).toMatchObject({ show_times: true, selected_date_label: FLOW_COPY.timeTaken });
    expect(r.data.time).toEqual([{ id: T1, title: '10:00' }]);
  });

  it('continue with no times left shows the no-times banner', async () => {
    const { h, ask } = await setup();
    h.world.slots['2026-09-29'] = [];
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data: { trigger: 'continue', service_slug: SVC_CUT, time: [T0] } }))!;
    expect(r.data).toMatchObject({ show_times: false, no_times: true, time: [] });
  });

  it.each([
    ['unknown service on service_selected', { trigger: 'service_selected', service: '00000000-0000-4000-8000-000000000999' }],
    ['non-uuid service', { trigger: 'service_selected', service: 'haircut' }],
    ['unknown service on date_selected', { trigger: 'date_selected', service: '00000000-0000-4000-8000-000000000998', date: '2026-09-29' }],
    ['unknown trigger', { trigger: 'nope' }],
    ['no trigger', {}],
    ['malformed fields', { trigger: 'continue', service_slug: 42 }],
    ['continue without a service', { trigger: 'continue', time: [T0] }],
  ])('restarts at SERVICE for %s', async (_l, data) => {
    const { h, ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data }))!;
    expect(r.screen).toBe('SERVICE');
    expect(h.world.appointments).toHaveLength(0);
  });

  it.each([
    ['no time chosen', { trigger: 'continue', service_slug: SVC_CUT }],
    ['a malformed time', { trigger: 'continue', service_slug: SVC_CUT, time: ['tomorrow'] }],
  ])('continue with %s re-renders DATETIME for the same service', async (_l, data) => {
    const { ask } = await setup();
    const r = dataOf(await ask({ action: 'data_exchange', screen: 'DATETIME', data }))!;
    expect(r).toMatchObject({ screen: 'DATETIME', data: { service_slug: SVC_CUT, show_times: false } });
  });

  it('BACK re-renders DATETIME fresh, or SERVICE without state', async () => {
    const { ask } = await setup();
    expect(dataOf(await ask({ action: 'BACK', screen: 'DATETIME', data: { service_slug: SVC_CUT } }))).toMatchObject({
      screen: 'DATETIME',
      data: { show_times: false, time: [] },
    });
    expect(dataOf(await ask({ action: 'BACK', screen: 'DATETIME', data: {} }))!.screen).toBe('SERVICE');
  });

  it('records each screen as an attempt step and answers with the data API version', async () => {
    const { h, ask } = await setup();
    const r = await ask({ action: 'INIT' });
    expect(r.status === 200 && r.body.version).toBe('3.0');
    await ask({ action: 'data_exchange', screen: 'SERVICE', data: { trigger: 'service_selected', service: SVC_CUT } });
    expect(h.repo.db.attempts[0]!.steps.map((s) => s.step)).toEqual(['flow:SERVICE', 'flow:DATETIME']);
  });

  it('acknowledges client error notifications and escalates flow_error', async () => {
    const { h, ask } = await setup();
    const r = await ask({ action: 'data_exchange', screen: 'DATETIME', data: { error: 'INVALID_SCREEN', error_message: 'x' } });
    expect(r).toEqual({ status: 200, body: { version: '3.0', data: { acknowledged: true } } });
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'flow_error' }]);
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
    expect(decryptResponse(r.text, aesKey, iv)).toEqual({ version: '3.0', data: { status: 'active' } });
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
