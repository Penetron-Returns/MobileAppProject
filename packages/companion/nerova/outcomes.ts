/**
 * Maps Nerova's outcome summary (`GET /v1/accounts/{id}/outcomes/summary`) to our small typed shape.
 *
 * ASSUMED, not confirmed against a live response: the docs say the summary holds the counts of
 * `booking.created`, `booking.rescheduled`, `booking.cancelled` and `conversation.handled`, "each with a
 * byActor split" (customerAgent, ownerCompanion, flow). The parser therefore accepts the type either as a
 * top-level key or under `outcomes` / `counts` / `totals`, and each value as a number or as an object with a
 * `count` / `total` / `value`, falling back to the sum of its `byActor` counts. Anything missing is 0.
 */
import type { CompanionOutcomesDTO } from '@booking/types';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const asCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;

function countOf(value: unknown): number {
  const direct = asCount(value);
  if (direct !== null) return direct;
  if (!isRecord(value)) return 0;
  for (const key of ['count', 'total', 'value']) {
    const found = asCount(value[key]);
    if (found !== null) return found;
  }
  const byActor = value.byActor;
  if (isRecord(byActor)) return Object.values(byActor).reduce<number>((sum, v) => sum + (asCount(v) ?? 0), 0);
  return 0;
}

function lookup(root: Json, type: string): unknown {
  for (const holder of [root, root.outcomes, root.counts, root.totals]) {
    if (isRecord(holder) && type in holder) return holder[type];
  }
  return undefined;
}

export function parseOutcomeSummary(root: Json): CompanionOutcomesDTO {
  return {
    bookings_created: countOf(lookup(root, 'booking.created')),
    bookings_rescheduled: countOf(lookup(root, 'booking.rescheduled')),
    bookings_cancelled: countOf(lookup(root, 'booking.cancelled')),
    conversations_handled: countOf(lookup(root, 'conversation.handled')),
  };
}
