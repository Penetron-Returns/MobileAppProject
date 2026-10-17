#!/usr/bin/env node
/**
 * One-time: adds `action.executed` and `action.undone` (act-then-undo) to the webhook that register-approval-webhook.mjs
 * created. NEVER runs automatically.
 *
 *   node scripts/nerova/update-webhook-events.mjs <api-key-file> <webhook-id whk_...> [--url <endpoint>] [--dry-run]
 *
 * Nerova updates an endpoint with `PUT /v1/webhooks/{webhookId}` (docs developer-platform/webhooks; needs
 * `webhooks:write` and an Idempotency-Key). The body repeats the url and sets the full eventFilters list. The signing
 * secret does not change, so NEROVA_WEBHOOK_SECRET stays as it is. Look the id up with `GET /v1/webhooks` if unknown.
 * The key is never printed.
 */
import { readFileSync } from 'node:fs';

const BASE_URL = (process.env.NEROVA_API_BASE_URL || 'https://api.nerova.si').replace(/\/+$/, '');
export const DEFAULT_URL = 'https://hmpkeujudylyuorentld.supabase.co/functions/v1/api/webhooks/nerova';
export const EVENT_FILTERS = ['approval.requested', 'action.executed', 'action.undone'];
export const IDEMPOTENCY_KEY = 'clovie-webhook-events-v2';

export function buildBody(url) {
  return { url, description: 'Clovie approval and action push', eventFilters: EVENT_FILTERS };
}

async function main() {
  const [keyFile, webhookId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const urlFlag = process.argv.indexOf('--url');
  const url = urlFlag >= 0 ? process.argv[urlFlag + 1] : DEFAULT_URL;
  if (!keyFile || !webhookId?.startsWith('whk_')) throw new Error('Usage: update-webhook-events.mjs <api-key-file> <webhook-id whk_...> [--url <endpoint>] [--dry-run]');
  const body = buildBody(url);
  if (process.argv.includes('--dry-run')) return console.log(`Dry run, would PUT /v1/webhooks/${webhookId} with`, JSON.stringify(body));
  const apiKey = readFileSync(keyFile, 'utf8').trim();
  if (!apiKey) throw new Error('The API key file is empty');
  const response = await fetch(`${BASE_URL}/v1/webhooks/${encodeURIComponent(webhookId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': IDEMPOTENCY_KEY },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`PUT /v1/webhooks/${webhookId} failed: ${response.status} ${payload?.code ?? ''}`.trim());
  console.log(`Updated ${webhookId}: ${EVENT_FILTERS.join(', ')}.`);
}

if (process.argv[1]?.endsWith('update-webhook-events.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
