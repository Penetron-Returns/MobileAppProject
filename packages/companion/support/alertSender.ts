/**
 * Support inbox alert for a new owner support request. `createSupportAlertSender` returns a Resend-over-fetch
 * sender when the API key, recipient and from address are all set, else a log-only no-op so nothing breaks
 * before the key is configured. The email carries ids, enums and the owner's own summary; never client PII.
 */
import type { Logger } from '@booking/features/lib/logger.ts';
import type { SupportAlert, SupportAlertSender } from '@booking/features/support/ports.ts';

export interface SupportAlertEnv {
  RESEND_API_KEY?: string;
  SUPPORT_ALERT_EMAIL?: string;
  SUPPORT_ALERT_FROM?: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

export function supportAlertSubject(alert: SupportAlert): string {
  return `Clovie support: ${alert.businessName ?? alert.businessId}${alert.category ? ` (${alert.category})` : ''}`;
}

export function supportAlertText(alert: SupportAlert): string {
  return [
    `Business: ${alert.businessName ?? 'unknown'} (${alert.businessId})`,
    `Category: ${alert.category ?? 'none'}`,
    `Reason: ${alert.reason ?? 'none'}`,
    `Raised at: ${alert.raisedAt ?? 'unknown'}`,
    `Escalation id: ${alert.escalationId ?? 'none'}`,
    `Support request id: ${alert.supportRequestId}`,
    `WhatsApp health: ${alert.healthSummary}`,
    '',
    'Summary:',
    alert.summary,
  ].join('\n');
}

export function createResendAlertSender(options: { apiKey: string; to: string; from: string; fetchImpl?: typeof fetch }): SupportAlertSender {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async send(alert) {
      const res = await doFetch(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: options.from, to: [options.to], subject: supportAlertSubject(alert), text: supportAlertText(alert) }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    },
  };
}

export function createNoopAlertSender(logger: Logger): SupportAlertSender {
  return {
    async send(alert) {
      logger.info('support_alert_skipped_unconfigured', { business_id: alert.businessId, support_request_id: alert.supportRequestId });
    },
  };
}

export function createSupportAlertSender(env: SupportAlertEnv, logger: Logger, fetchImpl?: typeof fetch): SupportAlertSender {
  const { RESEND_API_KEY: apiKey, SUPPORT_ALERT_EMAIL: to, SUPPORT_ALERT_FROM: from } = env;
  if (!apiKey || !to || !from) return createNoopAlertSender(logger);
  return createResendAlertSender({ apiKey, to, from, fetchImpl });
}
