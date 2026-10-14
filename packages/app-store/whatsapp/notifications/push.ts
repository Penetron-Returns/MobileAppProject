/**
 * Expo push to the business's registered devices. Push text never contains
 * customer names or phone numbers, only what happened and when.
 */
import type { Logger } from '@booking/features/lib/logger.ts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSender {
  /** Best effort: never throws. Returns the number of devices targeted. */
  toBusiness(businessId: string, message: PushMessage): Promise<number>;
}

export function createPushSender(deps: {
  listTokens: (businessId: string) => Promise<string[]>;
  accessToken?: string;
  fetch?: typeof fetch;
  logger: Logger;
}): PushSender {
  const doFetch = deps.fetch ?? fetch;
  return {
    async toBusiness(businessId, message) {
      try {
        const tokens = (await deps.listTokens(businessId)).filter((t) => /^(Exponent|Expo)PushToken\[.+\]$/.test(t));
        for (let i = 0; i < tokens.length; i += CHUNK) {
          const batch = tokens.slice(i, i + CHUNK).map((to) => ({ to, sound: 'default', ...message }));
          const res = await doFetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              ...(deps.accessToken ? { authorization: `Bearer ${deps.accessToken}` } : {}),
            },
            body: JSON.stringify(batch),
          });
          if (!res.ok) deps.logger.warn('push_failed', { business_id: businessId, status: res.status });
        }
        return tokens.length;
      } catch (err) {
        deps.logger.warn('push_error', { business_id: businessId, error: err });
        return 0;
      }
    },
  };
}
