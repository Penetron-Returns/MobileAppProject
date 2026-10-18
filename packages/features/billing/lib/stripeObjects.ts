/** Narrowing of Stripe payloads (unknown JSON) into the small shapes the billing service uses. */
import type { SubscriptionStatus, UUID } from '@booking/types';
import type { StripeSubscription } from '../ports.ts';

const STATUSES: readonly string[] = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export const asString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
/** A Stripe reference is either an id string or an expanded object with an `id`. */
export const refId = (value: unknown): string | null => asString(value) ?? asString(asRecord(value).id);

const isoFromUnix = (value: unknown): string | null =>
  typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;

/** Parses a subscription object. `current_period_end` moved from the subscription to its items in newer API versions: read both. */
export function parseSubscription(raw: unknown): StripeSubscription | null {
  const sub = asRecord(raw);
  const id = asString(sub.id);
  const customerId = refId(sub.customer);
  const status = asString(sub.status);
  if (!id || !customerId || !status || !STATUSES.includes(status)) return null;
  const items = asRecord(sub.items).data;
  const lines = (Array.isArray(items) ? items : []).map(asRecord);
  const periodEnd = lines.map((line) => isoFromUnix(line.current_period_end)).find((v) => v !== null) ?? null;
  const metadata = asRecord(sub.metadata);
  const businessId = asString(metadata.business_id);
  return {
    id,
    customerId,
    status: status as SubscriptionStatus,
    items: lines.flatMap((line) => {
      const id = asString(line.id);
      return id ? [{ id, priceId: refId(line.price) }] : [];
    }),
    currentPeriodEnd: isoFromUnix(sub.current_period_end) ?? periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    businessId: businessId && UUID_RE.test(businessId) ? (businessId as UUID) : null,
    metadataPlan: asString(metadata.plan),
  };
}
