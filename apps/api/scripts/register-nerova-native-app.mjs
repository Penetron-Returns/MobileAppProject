#!/usr/bin/env node
/**
 * One-time: registers the native admin app (development, preview and production ids) with Nerova so `platform: "native"` widget sessions and the WhatsApp
 * `returnUrl` are accepted. NEVER runs automatically; run it by hand once Nerova PR #946 is live:
 *
 *   NEROVA_API_KEY=... node apps/api/scripts/register-nerova-native-app.mjs [--dry-run]
 *
 * PUT /v1/embed-origins replaces the whole configuration, so this reads the current one first and sends back the
 * existing `origins` (and any other registered nativeApps) untouched. `--dry-run` prints the PUT body and sends nothing.
 * The API key is read from the environment only and is never printed.
 *
 * Contract confirmed by Nerova (#946): GET returns { origins, nativeApps }; PUT requires `origins` (the existing list, which
 * must include the Supabase API origin) plus `nativeApps: [{ appId, returnUrlSchemes, returnUrlOrigins? }]`, at most 10 apps.
 * It fails loudly, without a PUT, when GET returns no origins.
 */
const BASE_URL = (process.env.NEROVA_API_BASE_URL || 'https://api.nerova.si').replace(/\/+$/, '');
/** One entry per build variant (apps/mobile/app.config.ts): the appId is the Android application id, the scheme its deep-link scheme. */
const APPS = [
  { appId: 'si.nerova.booking.dev', returnUrlSchemes: ['bookingadmin'] },
  { appId: 'app.getclovie.preview', returnUrlSchemes: ['clovie-preview'] },
  { appId: 'app.getclovie', returnUrlSchemes: ['clovie'] },
];

/** The PUT body: current origins kept as-is, our apps added (or replaced by appId), other native apps kept. */
export function buildBody(current) {
  const origins = Array.isArray(current?.origins) ? current.origins : [];
  const ours = new Set(APPS.map((a) => a.appId));
  const others = (Array.isArray(current?.nativeApps) ? current.nativeApps : []).filter((a) => !ours.has(a?.appId));
  return { origins, nativeApps: [...others, ...APPS] };
}

async function call(method, body) {
  const response = await fetch(`${BASE_URL}/v1/embed-origins`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NEROVA_API_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} /v1/embed-origins failed: ${response.status} ${payload?.code ?? ''}`.trim());
  return payload;
}

async function main() {
  if (!process.env.NEROVA_API_KEY) throw new Error('NEROVA_API_KEY is not set');
  const current = await call('GET');
  if (!Array.isArray(current?.origins) || current.origins.length === 0) {
    throw new Error('GET /v1/embed-origins returned no origins; refusing to PUT (it would wipe the allowlist). Check the key and account.');
  }
  const body = buildBody(current);
  if (body.nativeApps.length > 10) throw new Error('Nerova allows at most 10 native apps');
  console.log('Current origins (kept):', JSON.stringify(body.origins));
  console.log('PUT nativeApps:', JSON.stringify(body.nativeApps));
  if (process.argv.includes('--dry-run')) return console.log('Dry run: nothing sent.');
  const result = await call('PUT', body);
  console.log('Done. Nerova now has:', JSON.stringify({ origins: result?.origins, nativeApps: result?.nativeApps }));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('register-nerova-native-app.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
