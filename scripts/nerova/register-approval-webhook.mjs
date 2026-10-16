#!/usr/bin/env node
/**
 * One-time: registers our approval webhook with Nerova. NEVER runs automatically.
 *
 *   node scripts/nerova/register-approval-webhook.mjs <api-key-file> <secret-out-file> [--url <endpoint>] [--dry-run]
 *
 * Reads the Nerova API key from a file (needs `webhooks:write`), POSTs /v1/webhooks with an Idempotency-Key and
 * eventFilters ["approval.requested"], and writes the returned `whsec_` signing secret (shown once) to the second
 * file with owner-only permissions. Neither the key nor the secret is ever printed. Put the secret in
 * NEROVA_WEBHOOK_SECRET (Doppler + Supabase secrets).
 *
 * Contract (Nerova docs developer-platform/webhooks): body { url (https), description?, eventFilters, accountIds? };
 * 201 with the endpoint (`id` whk_...) and the signing secret. The secret's field name is not spelled out in the
 * docs, so the script accepts `signingSecret`, `secret` or `signing_secret` and otherwise fails WITHOUT printing the body.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = (process.env.NEROVA_API_BASE_URL || 'https://api.nerova.si').replace(/\/+$/, '');
export const DEFAULT_URL = 'https://hmpkeujudylyuorentld.supabase.co/functions/v1/api/webhooks/nerova';
export const IDEMPOTENCY_KEY = 'clovie-approval-webhook-v1';

export function buildBody(url) {
  return { url, description: 'Clovie approval push', eventFilters: ['approval.requested'] };
}

export function extractSecret(payload) {
  const candidates = [payload?.signingSecret, payload?.secret, payload?.signing_secret, payload?.data?.signingSecret, payload?.data?.secret];
  return candidates.find((v) => typeof v === 'string' && v.length > 0) ?? null;
}

async function main() {
  const [keyFile, secretFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const urlFlag = process.argv.indexOf('--url');
  const url = urlFlag >= 0 ? process.argv[urlFlag + 1] : DEFAULT_URL;
  if (!keyFile || !secretFile || urlFlag === process.argv.length - 1) {
    throw new Error('Usage: register-approval-webhook.mjs <api-key-file> <secret-out-file> [--url <endpoint>] [--dry-run]');
  }
  const body = buildBody(url);
  if (process.argv.includes('--dry-run')) return console.log('Dry run, would POST /v1/webhooks with', JSON.stringify(body));
  const apiKey = readFileSync(keyFile, 'utf8').trim();
  if (!apiKey) throw new Error('The API key file is empty');
  const response = await fetch(`${BASE_URL}/v1/webhooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': IDEMPOTENCY_KEY },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`POST /v1/webhooks failed: ${response.status} ${payload?.code ?? ''}`.trim());
  const secret = extractSecret(payload);
  if (!secret) throw new Error(`Webhook created (${payload?.id ?? 'unknown id'}) but no signing secret field was found in the response; rotate the secret from the console.`);
  writeFileSync(secretFile, secret, { mode: 0o600 });
  console.log(`Registered ${payload?.id ?? 'webhook'} for approval.requested. Signing secret written to the second file (not printed).`);
}

if (process.argv[1]?.endsWith('register-approval-webhook.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
