/**
 * NerovaClientChannel (app-store port) over Nerova's notifications API, for businesses whose WhatsApp number lives
 * on Nerova. "Number on Nerova" is the companion plan: `plan_features.companion` (migration 20261014000001, "Nerova
 * owns their WhatsApp"). The Nerova account is the cached `nerova_account_id`, else our business id, which Nerova
 * accepts as externalReference. Partner API key, server-side only; failures are AppErrors without the key.
 */
import type { NerovaClientChannel, NerovaNotification } from '@booking/app-store/whatsapp/notifications/nerovaChannel.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { EntitlementService } from '@booking/features/ports.ts';
import type { PlanRepository } from '@booking/features/plans/ports.ts';
import { NEROVA_API_BASE_URL, type NerovaEnv } from './httpClient.ts';

export interface NerovaClientChannelOptions {
  /** Unset = the channel owns the number but cannot send (COMPANION_NOT_READY); nothing leaves the process */
  apiKey: string | undefined;
  entitlements: Pick<EntitlementService, 'hasFeature'>;
  plans: Pick<PlanRepository, 'getProfile'>;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const upstream = (message: string, details: Record<string, unknown>) => new AppError('UPSTREAM_COMPANION_ERROR', message, details);
const code = (payload: unknown): string | null => {
  const value = (payload as { code?: unknown } | null)?.code;
  return typeof value === 'string' ? value : null;
};

export function createNerovaClientChannel(options: NerovaClientChannelOptions): NerovaClientChannel {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? NEROVA_API_BASE_URL).replace(/\/+$/, '');

  return {
    ownsNumber: (businessId) => options.entitlements.hasFeature(businessId, 'companion'),

    async send(businessId, notification: NerovaNotification, idempotencyKey) {
      if (!options.apiKey) throw new AppError('COMPANION_NOT_READY', 'The companion is not available yet', { reason: 'unavailable' });
      const { nerovaAccountId } = await options.plans.getProfile(businessId);
      const { type, ...fields } = notification;
      let response: Response;
      try {
        response = await doFetch(`${base}/v1/accounts/${encodeURIComponent(nerovaAccountId ?? businessId)}/notifications`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({ ...fields, type, actor: { actorReference: 'system:booking-platform' } }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
        });
      } catch {
        throw upstream('The companion service is unreachable', { reason: 'network' });
      }
      if (response.ok) return 'sent';
      const nerovaCode = code(await response.json().catch(() => null));
      if (response.status === 409 && nerovaCode === 'notifications.recipient_opted_out') return 'opted_out';
      throw upstream('The companion service rejected the notification', { status: response.status, nerova_code: nerovaCode });
    },
  };
}

export const createNerovaClientChannelFromEnv = (
  env: NerovaEnv,
  deps: Omit<NerovaClientChannelOptions, 'apiKey'>,
): NerovaClientChannel => createNerovaClientChannel({ ...deps, apiKey: env.NEROVA_API_KEY });
