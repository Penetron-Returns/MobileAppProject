/**
 * Expo push to the business's registered devices, or to specific users' devices.
 * Booking-change pushes never contain customer names or phone numbers, only what happened and
 * when. The attendance check is the one exception: it names the client's first name (an owner
 * decision), and never a phone number.
 */
import type { Logger } from '@booking/features/lib/logger.ts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Notification category (action buttons) registered by the app */
  categoryId?: string;
}

export interface PushSender {
  /** Best effort: never throws. Returns the number of devices targeted. */
  toBusiness(businessId: string, message: PushMessage): Promise<number>;
  /** Same, limited to the devices of the given users of the business. */
  toUsers(businessId: string, userIds: string[], message: PushMessage): Promise<number>;
}

export function createPushSender(deps: {
  /** Devices of the whole business; without it `toBusiness` targets nothing */
  listTokens?: (businessId: string) => Promise<string[]>;
  listUserTokens?: (businessId: string, userIds: string[]) => Promise<string[]>;
  accessToken?: string;
  fetch?: typeof fetch;
  logger: Logger;
}): PushSender {
  const doFetch = deps.fetch ?? fetch;

  async function send(businessId: string, rawTokens: string[], message: PushMessage): Promise<number> {
    const tokens = rawTokens.filter((t) => /^(Exponent|Expo)PushToken\[.+\]$/.test(t));
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
  }

  return {
    async toBusiness(businessId, message) {
      try {
        if (!deps.listTokens) return 0;
        return await send(businessId, await deps.listTokens(businessId), message);
      } catch (err) {
        deps.logger.warn('push_error', { business_id: businessId, error: err });
        return 0;
      }
    },
    async toUsers(businessId, userIds, message) {
      try {
        if (!deps.listUserTokens || userIds.length === 0) return 0;
        return await send(businessId, await deps.listUserTokens(businessId, userIds), message);
      } catch (err) {
        deps.logger.warn('push_error', { business_id: businessId, error: err });
        return 0;
      }
    },
  };
}
