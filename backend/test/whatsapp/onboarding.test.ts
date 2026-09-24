import { generateKeyPairSync } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { decryptSecret } from '../../src/lib/crypto.ts';
import { TEMPLATE_DEFINITIONS } from '../../src/whatsapp/assets.ts';
import { GraphError } from '../../src/whatsapp/graph.ts';
import { mapTemplateStatus } from '../../src/whatsapp/onboarding.ts';
import { appHarness, BIZ, NOW, PHONE_NUMBER_ID, WABA_ID } from './fakes.ts';

let privatePem: string;
beforeAll(() => {
  privatePem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
});

const API_BASE = 'https://abcdefgh.supabase.co/functions/v1/api';
const TOKEN = 'EAAG-system-user-token-0123456789';
const connectBody = { waba_id: WABA_ID, phone_number_id: PHONE_NUMBER_ID, access_token: TOKEN };

function setup(env: Record<string, string> = {}) {
  return appHarness({ account: null, env: { WHATSAPP_FLOW_PRIVATE_KEY: privatePem, API_BASE_URL: `${API_BASE}/`, ...env } });
}

const methods = (h: ReturnType<typeof setup>) => h.graph.calls.map((c) => c.method);

describe('onboarding: manual connect with a system-user token', () => {
  it('runs every setup step and goes live', async () => {
    const h = setup();
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.status).toBe(200);
    expect(methods(h)).toEqual([
      'debugToken',
      'subscribeApp',
      'getPhoneNumber',
      'uploadFlowPublicKey',
      'listFlows',
      'createFlow',
      'createFlow',
      'listTemplates',
      'createTemplate',
      'createTemplate',
      'createTemplate',
      'createTemplate',
    ]);
    const flows = h.graph.calls.filter((c) => c.method === 'createFlow').map((c) => c.args[1] as { name: string; endpointUri: string; publish: boolean });
    expect(flows).toEqual([
      expect.objectContaining({ name: 'booking_v1', endpointUri: `${API_BASE}/flows/whatsapp`, publish: true }),
      expect.objectContaining({ name: 'reschedule_v1', endpointUri: `${API_BASE}/flows/whatsapp`, publish: true }),
    ]);
    const upload = h.graph.calls.find((c) => c.method === 'uploadFlowPublicKey')!;
    expect(upload.args[1]).toContain('BEGIN PUBLIC KEY');

    expect(r.body.data).toMatchObject({
      connected: true,
      status: 'live',
      display_phone: '+27 82 000 0000',
      verified_name: 'Nadia Hair',
      quality_rating: 'GREEN',
      messaging_limit: 'TIER_1K',
      last_error: null,
      flows: { booking: 'flow-booking_v1', reschedule: 'flow-reschedule_v1' },
    });
    expect(r.body.data.templates.map((t: { name: string; status: string }) => [t.name, t.status])).toEqual(
      TEMPLATE_DEFINITIONS.map((t) => [t.name, 'submitted']),
    );
  });

  it('stores the token encrypted and never returns it', async () => {
    const h = setup();
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.text).not.toContain(TOKEN);
    const account = h.repo.db.accounts[0]!;
    expect(account.access_token_ciphertext).toMatch(/^v1:/);
    expect(account.access_token_ciphertext).not.toContain(TOKEN);
    expect(decryptSecret(account.access_token_ciphertext!, h.deps.env.TOKEN_ENCRYPTION_KEY!)).toBe(TOKEN);
    const status = await h.call('GET', '/v1/whatsapp');
    expect(status.text).not.toContain('v1:');
    expect(status.text).not.toContain(TOKEN);
  });

  it('is idempotent: running it again reuses flows and templates', async () => {
    const h = setup();
    await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    h.graph.calls.length = 0;
    const again = await h.call('POST', '/v1/whatsapp/sync');
    expect(again.status).toBe(200);
    expect(methods(h)).not.toContain('createFlow');
    expect(methods(h)).not.toContain('createTemplate');
    expect(h.repo.db.templates).toHaveLength(4);
    expect(h.repo.db.accounts).toHaveLength(1);
  });

  it('registers the number with the PIN only when it is not connected yet', async () => {
    const h = setup();
    const graph = h.graph.factory;
    let phoneCalls = 0;
    h.deps.graph = (token) => {
      const g = graph(token);
      return {
        ...g,
        getPhoneNumber: async (id) => ({ ...(await g.getPhoneNumber(id)), status: phoneCalls++ === 0 ? 'PENDING' : 'CONNECTED' }),
      };
    };
    await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    const register = h.graph.calls.find((c) => c.method === 'registerNumber');
    expect(register?.args).toEqual([PHONE_NUMBER_ID, '123456']);
  });

  it('records last_error and returns 502 when a required step fails, then resumes on sync', async () => {
    const h = setup();
    const graph = h.graph.factory;
    let fail = true;
    h.deps.graph = (token) => ({
      ...graph(token),
      subscribeApp: async () => {
        if (fail) throw new GraphError({ message: 'Temporary', status: 500, code: 2 });
      },
    });
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatchObject({ code: 'UPSTREAM_META_ERROR', details: { step: 'subscribe' } });
    expect(h.repo.db.accounts[0]).toMatchObject({ status: 'pending', last_error: 'subscribe: other (2): Temporary' });

    fail = false;
    const retry = await h.call('POST', '/v1/whatsapp/sync');
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ status: 'live', last_error: null });
  });

  it('marks needs_reauth when Meta says the token is invalid', async () => {
    const h = setup();
    const graph = h.graph.factory;
    h.deps.graph = (token) => ({
      ...graph(token),
      subscribeApp: async () => {
        throw new GraphError({ message: 'Error validating access token', status: 401, code: 190 });
      },
    });
    await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(h.repo.db.accounts[0]).toMatchObject({ status: 'needs_reauth' });
  });

  it('still goes live when Flows are not configured, noting why', async () => {
    const h = setup({ WHATSAPP_FLOW_PRIVATE_KEY: '' });
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.body.data.status).toBe('live');
    expect(r.body.data.flows).toEqual({ booking: null, reschedule: null });
    expect(r.body.data.last_error).toMatch(/^flow_key: .*WHATSAPP_FLOW_PRIVATE_KEY/);
    expect(methods(h)).not.toContain('createFlow');
  });

  it('skips Flows when API_BASE_URL is not configured', async () => {
    const h = setup({ API_BASE_URL: '' });
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.body.data).toMatchObject({ status: 'live', flows: { booking: null, reschedule: null } });
    expect(r.body.data.last_error).toContain('API_BASE_URL');
    expect(methods(h)).not.toContain('uploadFlowPublicKey');
  });

  it('publishes an existing draft flow instead of creating a new one', async () => {
    const h = setup();
    h.graph.flows.push({ id: 'draft-1', name: 'booking_v1', status: 'DRAFT' });
    await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(methods(h)).toEqual(expect.arrayContaining(['updateFlowJson', 'updateFlowMetadata', 'publishFlow']));
    expect(h.repo.db.accounts[0]!.flow_ids).toEqual({ booking: 'draft-1', reschedule: 'flow-reschedule_v1' });
  });

  it('adopts templates that already exist at Meta with their status', async () => {
    const h = setup();
    h.graph.templates.push({ id: 'meta-1', name: 'booking_reminder', language: 'en', status: 'APPROVED', category: 'UTILITY' });
    await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    const reminder = h.repo.db.templates.find((t) => t.name === 'booking_reminder')!;
    expect(reminder).toMatchObject({ meta_template_id: 'meta-1', status: 'approved' });
    expect(h.graph.calls.filter((c) => c.method === 'createTemplate')).toHaveLength(3);
  });

  it('rejects an invalid token before storing anything', async () => {
    const h = setup();
    const graph = h.graph.factory;
    h.deps.graph = (token) => ({ ...graph(token), debugToken: async () => ({ isValid: false, expiresAt: null, scopes: [] }) });
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.status).toBe(400);
    expect(h.repo.db.accounts).toHaveLength(0);
  });

  it('refuses a number that belongs to another business', async () => {
    const h = setup();
    h.repo.db.accounts.push({ ...(await h.repo.upsertAccount('00000000-0000-4000-8000-000000000999', { waba_id: '1', phone_number_id: PHONE_NUMBER_ID })) });
    h.repo.db.accounts.splice(1);
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    expect(r.status).toBe(400);
    expect(r.body.error.details).toEqual({ field: 'phone_number_id' });
  });

  it('validates the body', async () => {
    const h = setup();
    const r = await h.call('POST', '/v1/whatsapp/connect', { body: { ...connectBody, waba_id: 'abc' } });
    expect(r.status).toBe(400);
  });

  it('is owner-only', async () => {
    const h = setup();
    expect((await h.call('POST', '/v1/whatsapp/connect', { token: 'staff', body: connectBody })).status).toBe(403);
    expect((await h.call('GET', '/v1/whatsapp', { token: 'staff' })).status).toBe(200);
  });
});

describe('onboarding: Embedded Signup', () => {
  it('exchanges the code for a token and connects', async () => {
    const h = setup();
    h.graph.debugExpiresAt = new Date(NOW.getTime() + 60 * 86400_000);
    const r = await h.call('POST', '/v1/whatsapp/embedded-signup', { body: { code: 'code-123', waba_id: WABA_ID, phone_number_id: PHONE_NUMBER_ID } });
    expect(r.status).toBe(200);
    expect(methods(h).slice(0, 2)).toEqual(['exchangeCode', 'debugToken']);
    expect(h.graph.calls[0]!.args[0]).toEqual({ appId: 'app-id', appSecret: 'app-secret', code: 'code-123' });
    expect(r.body.data).toMatchObject({ status: 'live', token_expires_at: h.graph.debugExpiresAt.toISOString() });
    expect(decryptSecret(h.repo.db.accounts[0]!.access_token_ciphertext!, h.deps.env.TOKEN_ENCRYPTION_KEY!)).toBe('EAAG-business-token');
    // Setup calls use the exchanged token.
    expect(h.graph.calls.find((c) => c.method === 'subscribeApp')!.token).toBe('EAAG-business-token');
  });

  it('needs the Meta app credentials', async () => {
    const h = setup({ META_APP_ID: '' });
    const r = await h.call('POST', '/v1/whatsapp/embedded-signup', { body: { code: 'c', waba_id: WABA_ID, phone_number_id: PHONE_NUMBER_ID } });
    expect(r.status).toBe(500);
    expect(h.repo.db.accounts).toHaveLength(0);
  });
});

describe('onboarding: lifecycle', () => {
  async function connected() {
    const h = setup();
    await h.call('POST', '/v1/whatsapp/connect', { body: connectBody });
    h.graph.calls.length = 0;
    return h;
  }

  it('reports not connected before setup', async () => {
    const h = setup();
    const r = await h.call('GET', '/v1/whatsapp');
    expect(r.body.data).toMatchObject({ connected: false, status: null, templates: [], flows: { booking: null, reschedule: null } });
  });

  it('pauses and resumes', async () => {
    const h = await connected();
    expect((await h.call('POST', '/v1/whatsapp/pause')).body.data.status).toBe('paused');
    expect((await h.call('POST', '/v1/whatsapp/pause')).body.data.status).toBe('paused');
    // A sync while paused keeps it paused.
    expect((await h.call('POST', '/v1/whatsapp/sync')).body.data.status).toBe('paused');
    expect((await h.call('POST', '/v1/whatsapp/resume')).body.data.status).toBe('live');
  });

  it('disconnects: unsubscribes, forgets the token, and refuses further sends', async () => {
    const h = await connected();
    const r = await h.call('POST', '/v1/whatsapp/disconnect');
    expect(r.body.data).toMatchObject({ connected: false, status: 'disconnected' });
    expect(methods(h)).toEqual(['unsubscribeApp']);
    expect(h.repo.db.accounts[0]!.access_token_ciphertext).toBeNull();
    expect((await h.call('POST', '/v1/whatsapp/resume')).status).toBe(422);
    expect((await h.call('POST', '/v1/whatsapp/sync')).status).toBe(422);
    expect((await h.call('POST', '/v1/whatsapp/test-message', { body: { to: '082 123 4567' } })).status).toBe(422);
    expect((await h.call('POST', '/v1/whatsapp/disconnect')).status).toBe(200);
  });

  it('sends hello_world as a test message to a normalised number', async () => {
    const h = await connected();
    const r = await h.call('POST', '/v1/whatsapp/test-message', { body: { to: '082 123 4567' } });
    expect(r.status).toBe(200);
    expect(r.body.data.wa_message_id).toBe('wamid.out.1');
    expect(h.graph.sent[0]!.payload).toEqual({ to: '27821234567', type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } });
  });

  it('maps Meta send errors to UPSTREAM_META_ERROR', async () => {
    const h = await connected();
    h.graph.failNext(new GraphError({ message: 'Recipient not on allowed list', status: 400, code: 131030 }));
    const r = await h.call('POST', '/v1/whatsapp/test-message', { body: { to: '0821234567' } });
    expect(r.status).toBe(502);
    expect(r.body.error.details).toMatchObject({ meta_code: 131030 });
  });

  it('404s lifecycle calls when nothing is connected', async () => {
    const h = setup();
    expect((await h.call('POST', '/v1/whatsapp/pause')).status).toBe(404);
  });

  it('scopes to the caller business', async () => {
    const h = await connected();
    expect(h.repo.db.accounts[0]!.business_id).toBe(BIZ);
  });
});

describe('template status mapping', () => {
  it.each([
    ['APPROVED', 'approved'],
    ['PENDING', 'submitted'],
    ['IN_APPEAL', 'submitted'],
    ['REJECTED', 'rejected'],
    ['PAUSED', 'paused'],
    ['DISABLED', 'disabled'],
    ['SOMETHING_NEW', 'draft'],
  ] as const)('%s → %s', (meta, ours) => {
    expect(mapTemplateStatus(meta)).toBe(ours);
  });
});
