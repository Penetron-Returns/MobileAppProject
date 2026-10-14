// Deno smoke test: proves the backend graph resolves and boots under the Edge runtime.
// Run: cd backend && npm run test:edge
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
Deno.env.set('CRON_SECRET', 'cron-secret');
Deno.env.set('WHATSAPP_VERIFY_TOKEN', 'verify-token');

const { Hono } = await import('hono');
const { createApp } = await import('../../../apps/backend/src/app.ts');
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
  const { encryptSecret, decryptSecret } = await import('../../../apps/backend/src/lib/crypto.ts');
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
