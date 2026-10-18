// Deno smoke test: proves the backend graph resolves and boots under the Edge runtime.
// Run: cd apps/api && npm run test:edge
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
Deno.env.set('CRON_SECRET', 'cron-secret');
Deno.env.set('WHATSAPP_VERIFY_TOKEN', 'verify-token');
// Nerova connector: only the SHA-256 of the bearer token is configured.
const connectorToken = 'deno-smoke-connector-token';
const connectorHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(connectorToken)))]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
Deno.env.set('NEROVA_CONNECTOR_TOKEN_HASHES', connectorHash);

// Throwaway Flows key pair. The container caches env on first use, so it must be set before the import below.
const flowKeys = await crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['encrypt', 'decrypt'],
);
const flowPkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', flowKeys.privateKey));
const flowPem = ['-----BEGIN PRIVATE KEY-----', btoa(String.fromCharCode(...flowPkcs8)), '-----END PRIVATE KEY-----', ''].join('\n');
// Env vars carry the PEM on one line with literal \n escapes.
Deno.env.set('WHATSAPP_FLOW_PRIVATE_KEY', flowPem.replaceAll('\n', '\\n'));

const { Hono } = await import('hono');
const { createApp } = await import('../../../../../apps/api/src/app.ts');
const server = new Hono().route('/api', createApp());

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

Deno.test('health responds under the /api prefix', async () => {
  const res = await server.request('/api/health');
  assertEquals(res.status, 200, 'status');
  assertEquals(Boolean(res.headers.get('x-request-id')), true, 'x-request-id header');
});

Deno.test('v1 routes require a Clerk bearer token', async () => {
  const res = await server.request('/api/v1/me');
  assertEquals(res.status, 401, 'status');
  const body = await res.json();
  assertEquals(body.error.code, 'UNAUTHENTICATED', 'error code');
});

Deno.test('cron routes require the shared secret', async () => {
  const res = await server.request('/api/cron/cleanup', { method: 'POST' });
  assertEquals(res.status, 401, 'status');
});

Deno.test('node:crypto AES-GCM secrets round-trip under Deno', async () => {
  const { encryptSecret, decryptSecret } = await import('@booking/features/lib/crypto.ts');
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  assertEquals(decryptSecret(encryptSecret('EAAG-token', key), key), 'EAAG-token', 'round trip');
});

Deno.test('webhook verify handshake returns the challenge under Deno', async () => {
  // Uses WHATSAPP_VERIFY_TOKEN from env; the container reads env lazily per request.
  const token = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? 'verify-token';
  const q = `hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`;
  const res = await server.request(`/api/webhooks/whatsapp?${q}`);
  assertEquals(res.status, 200, 'status');
  assertEquals(await res.text(), '12345', 'challenge');
  const bad = await server.request('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1');
  assertEquals(bad.status, 403, 'bad token status');
});

// Regression: node:crypto privateDecrypt rejected the parsed key ("Invalid key type") on the
// Edge runtime, so Meta's Flows health check got 421. Encrypts exactly like Meta's client.
Deno.test('flows endpoint decrypts a ping and answers with the inverted IV under Deno', async () => {
  const aesKeyRaw = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.importKey('raw', aesKeyRaw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(JSON.stringify({ action: 'ping', version: '3.0' })));
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, flowKeys.publicKey, aesKeyRaw);
  const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));

  const res = await server.request('/api/flows/whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ encrypted_flow_data: b64(body), encrypted_aes_key: b64(wrapped), initial_vector: b64(iv) }),
  });
  assertEquals(res.status, 200, 'status');
  const sealed = Uint8Array.from(atob(await res.text()), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.map((b) => ~b & 0xff) }, aesKey, sealed);
  assertEquals(new TextDecoder().decode(plain), JSON.stringify({ version: '3.0', data: { status: 'active' } }), 'response');
});

// Published Flows are immutable, so the names the backend looks up must stay in step with the JSON it ships.
Deno.test('Flow definitions load under Deno: booking_v2 and reschedule_v2 end on a complete action', async () => {
  const { FLOW_DEFINITIONS } = await import('@booking/app-store/whatsapp/assets.ts');
  assertEquals(FLOW_DEFINITIONS.booking.name, 'booking_v2', 'booking name');
  assertEquals(FLOW_DEFINITIONS.reschedule.name, 'reschedule_v2', 'reschedule name');
  for (const def of Object.values(FLOW_DEFINITIONS)) {
    const terminal = (def.json.screens as { terminal?: boolean; layout: unknown }[]).filter((s) => s.terminal);
    assertEquals(terminal.length, 1, `${def.name} terminal screens`);
    const layout = JSON.stringify(terminal[0]!.layout);
    assertEquals(layout.includes('"name":"complete"'), true, `${def.name} terminal uses complete`);
    assertEquals(layout.includes('data_exchange'), false, `${def.name} terminal has no data_exchange`);
  }
});

Deno.test('nerova connector rejects a bad token and lists the published tools under Deno', async () => {
  const rpc = (token: string | null) =>
    server.request('/api/connector/nerova/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
  assertEquals((await rpc(null)).status, 401, 'missing token status');
  assertEquals((await rpc('wrong')).status, 401, 'wrong token status');
  const ok = await rpc(connectorToken);
  assertEquals(ok.status, 200, 'status');
  const { result } = await ok.json();
  assertEquals(result.tools.length, 14, 'tool count');
  assertEquals(result.tools[0].name, 'accounts_list', 'first tool');
});

Deno.test('checkout confirm skips the idempotency key and wildcard CORS under the /api prefix', async () => {
  const origin = 'http://localhost:3000';
  const post = await server.request('/api/public/billing/checkout/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ session_id: 'cs_test_missing' }),
  });
  const body = await post.json();
  assertEquals(body?.error?.code === 'IDEMPOTENCY_KEY_REQUIRED', false, 'idempotency key not required');
  const pre = await server.request('/api/public/billing/checkout/confirm', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  });
  assertEquals(pre.headers.get('access-control-allow-origin'), origin, 'preflight echoes the allowed origin');
});
