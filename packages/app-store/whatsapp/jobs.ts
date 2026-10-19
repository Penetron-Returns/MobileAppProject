/**
 * WhatsApp / notification cron jobs (routes/cron.ts). Each is idempotent,
 * handles one item at a time so a failure never blocks the rest, and returns
 * counts for the cron log.
 */

import { encryptSecret } from '@booking/features/lib/crypto.ts';
import { reminderMessage } from './notifications/customer.ts';
import { accountGraph, accountToken, getWaDeps, type WaContainer, type WaDeps } from './deps.ts';
import { casSave } from './engine/index.ts';
import { isGraphError } from './graph.ts';
import { syncTemplateStatuses } from './onboarding.ts';
import { sendOutbound } from './outbound.ts';
import type { ReminderClaim, WaAccountRow } from './repo.ts';

type Job = (container: WaContainer, now?: Date) => Promise<Record<string, number>>;

const REMINDER_BATCH = 100;
const EXPIRY_BATCH = 200;
/** Long-lived user tokens are refreshed when they expire within this window. */
const REFRESH_AHEAD_MS = 7 * 24 * 3600_000;

const depsAt = (container: WaContainer, now?: Date): WaDeps => {
  const deps = getWaDeps(container);
  return now ? { ...deps, now: () => now } : deps;
};

// ---------------------------------------------------------------- reminders

export const runRemindersJob: Job = async (container, now) => runReminders(depsAt(container, now));

export async function runReminders(deps: WaDeps) {
  const counts = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const claims = await deps.repo.claimDueReminders(deps.now().toISOString(), REMINDER_BATCH);
  for (const claim of claims) {
    counts.claimed += 1;
    let state: 'sent' | 'failed' | 'skipped';
    let extra: Record<string, unknown> = {};
    try {
      const result = await sendReminder(deps, claim);
      state = result.state;
      extra = result.extra;
    } catch (err) {
      deps.logger.error('wa_reminder_failed', { appointment_id: claim.appointment_id, error: err });
      state = 'failed';
      extra = { reason: 'exception' };
    }
    counts[state] += 1;
    await deps.repo
      .setReminderState(claim, { state, ...extra, at: deps.now().toISOString() })
      .catch((err) => deps.logger.error('wa_reminder_state_failed', { appointment_id: claim.appointment_id, error: err }));
  }
  return counts;
}

async function sendReminder(deps: WaDeps, claim: ReminderClaim): Promise<{ state: 'sent' | 'failed' | 'skipped'; extra: Record<string, unknown> }> {
  const skipped = (reason: string) => ({ state: 'skipped' as const, extra: { reason } });
  const appt = await deps.repo.getAppointmentBrief(claim.business_id, claim.appointment_id);
  if (!appt || appt.status !== 'confirmed') return skipped('not_confirmed');
  if (Date.parse(appt.starts_at) !== Date.parse(claim.starts_at)) return skipped('moved');
  const [client, account, business] = await Promise.all([
    deps.repo.getClient(claim.business_id, claim.client_id),
    deps.repo.getAccountByBusiness(claim.business_id),
    deps.repo.getBusinessBrief(claim.business_id),
  ]);
  if (!client || !business) return skipped('missing');
  if (client.is_blocked || !client.whatsapp_opt_in) return skipped('opted_out');
  if (!account || account.status !== 'live') return skipped('channel_not_live');

  const conv = await deps.repo.getOrCreateConversation(claim.business_id, client.id);
  const outcome = await sendOutbound(
    deps,
    { account, businessId: claim.business_id, conversationId: conv.id, clientId: client.id, to: client.phone_e164 },
    reminderMessage(appt, business),
    { dedupeKey: `reminder:${appt.id}:${claim.offset_minutes}:${new Date(claim.starts_at).toISOString()}` },
  );
  if (outcome.status === 'sent') return { state: 'sent', extra: { message_id: outcome.messageId } };
  if (outcome.status === 'skipped') return skipped('duplicate');
  return { state: 'failed', extra: { reason: outcome.error.kind, code: outcome.error.code ?? null } };
}

// ---------------------------------------------------------------- conversation expiry

export const runConversationExpiryJob: Job = async (container, now) => runConversationExpiry(depsAt(container, now));

/**
 * Closes conversations whose 24h window has passed mid-flow (the customer
 * can no longer receive interactive messages) and abandons their attempts.
 * Escalated threads are left alone until staff release them.
 */
export async function runConversationExpiry(deps: WaDeps) {
  const counts = { expired: 0, attempts_abandoned: 0, conflicts: 0 };
  const at = deps.now().toISOString();
  for (const conv of await deps.repo.listExpiredConversations(at, EXPIRY_BATCH)) {
    const saved = await casSave(deps, conv, (current) =>
      current.window_expires_at && current.window_expires_at < at && !['idle', 'closed', 'escalated'].includes(current.state)
        ? { state: 'closed', context: {}, invalid_input_count: 0 }
        : {},
    );
    if (!saved || saved.state !== 'closed') {
      counts.conflicts += saved ? 0 : 1;
      continue;
    }
    counts.expired += 1;
    counts.attempts_abandoned += await deps.repo.abandonAttemptsForConversation(conv.id, at);
  }
  return counts;
}

// ---------------------------------------------------------------- WABA health

export const runWabaHealthJob: Job = async (container, now) => runWabaHealth(depsAt(container, now));

/** Refreshes phone quality / limits and template statuses for connected numbers. */
export async function runWabaHealth(deps: WaDeps) {
  const counts = { checked: 0, healthy: 0, needs_reauth: 0, failed: 0 };
  const accounts = await deps.repo.listAccounts({ statuses: ['live', 'paused', 'needs_reauth'] });
  for (const account of accounts) {
    counts.checked += 1;
    const at = deps.now().toISOString();
    const graph = accountGraph(deps, account);
    if (!graph) {
      await markNeedsReauth(deps, account, 'health: no usable access token', at);
      counts.needs_reauth += 1;
      continue;
    }
    try {
      const info = await graph.getPhoneNumber(account.phone_number_id);
      await deps.repo.updateAccount(account.id, {
        display_phone: info.display_phone_number ?? account.display_phone,
        verified_name: info.verified_name ?? account.verified_name,
        quality_rating: info.quality_rating ?? account.quality_rating,
        messaging_limit: info.messaging_limit_tier ?? account.messaging_limit,
        last_health_check_at: at,
        last_error: null,
        // A token that works again lifts needs_reauth.
        ...(account.status === 'needs_reauth' ? { status: 'live' as const } : {}),
      });
      await syncTemplateStatuses(deps, account, graph).catch((err) =>
        deps.logger.warn('wa_template_sync_failed', { account_id: account.id, error: isGraphError(err) ? err.summary() : err }),
      );
      counts.healthy += 1;
    } catch (err) {
      if (isGraphError(err) && err.kind === 'token_invalid') {
        await markNeedsReauth(deps, account, `health: ${err.summary()}`, at);
        counts.needs_reauth += 1;
      } else {
        const summary = isGraphError(err) ? err.summary() : 'unexpected error';
        await deps.repo.updateAccount(account.id, { last_health_check_at: at, last_error: `health: ${summary}` }).catch(() => undefined);
        counts.failed += 1;
      }
    }
  }
  return counts;
}

async function markNeedsReauth(deps: WaDeps, account: WaAccountRow, error: string, at: string) {
  await deps.repo.updateAccount(account.id, { status: 'needs_reauth', last_error: error.slice(0, 300), last_health_check_at: at });
}

// ---------------------------------------------------------------- token refresh

export const runTokenRefreshJob: Job = async (container, now) => runTokenRefresh(depsAt(container, now));

/**
 * Exchanges expiring long-lived user tokens for fresh ones. System-user and
 * Embedded Signup business tokens do not expire (token_expires_at is null)
 * and are never touched.
 */
export async function runTokenRefresh(deps: WaDeps) {
  const counts = { checked: 0, refreshed: 0, needs_reauth: 0, failed: 0 };
  const { META_APP_ID: appId, META_APP_SECRET: appSecret, TOKEN_ENCRYPTION_KEY: key } = deps.env;
  if (!appId || !appSecret || !key) return counts;
  const nowMs = deps.now().getTime();
  const accounts = await deps.repo.listAccounts({
    statuses: ['live', 'paused', 'pending'],
    tokenExpiresBefore: new Date(nowMs + REFRESH_AHEAD_MS).toISOString(),
  });
  for (const account of accounts) {
    counts.checked += 1;
    const at = deps.now().toISOString();
    const current = accountToken(deps.env, account);
    if (!current || (account.token_expires_at && Date.parse(account.token_expires_at) <= nowMs)) {
      await markNeedsReauth(deps, account, 'token expired: reconnect WhatsApp', at);
      counts.needs_reauth += 1;
      continue;
    }
    try {
      const token = await deps.graph(current).exchangeLongLived({ appId, appSecret, token: current });
      await deps.repo.updateAccount(account.id, {
        access_token_ciphertext: encryptSecret(token.accessToken, key),
        token_expires_at: token.expiresIn ? new Date(nowMs + token.expiresIn * 1000).toISOString() : null,
        last_error: null,
      });
      counts.refreshed += 1;
    } catch (err) {
      const summary = isGraphError(err) ? err.summary() : 'unexpected error';
      if (isGraphError(err) && err.kind === 'token_invalid') {
        await markNeedsReauth(deps, account, `token refresh: ${summary}`, at);
        counts.needs_reauth += 1;
      } else {
        await deps.repo.updateAccount(account.id, { last_error: `token refresh: ${summary}` }).catch(() => undefined);
        counts.failed += 1;
      }
    }
  }
  return counts;
}
