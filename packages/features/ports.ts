/**
 * Contracts between modules, one file per feature, re-exported here so
 * consumers have a single place to import from. Changing a signature means
 * updating every implementation and fake in the same PR.
 */
import type { UUID } from '@booking/types';

export * from './attendance/ports.ts';
export * from './billing/ports.ts';
export * from './bookings/ports.ts';
export * from './plans/ports.ts';
export * from './team/ports.ts';

export type AccountEventType = 'account.created' | 'account.updated' | 'account.removed';

/**
 * Tells the AI companion platform (Nerova today) that a business changed so it re-reads
 * the account. Best effort: must never throw, and is a no-op unless events are enabled.
 * Implemented by `@booking/companion`, wired in `apps/api/src/container.ts`.
 */
export interface AccountEventsPort {
  accountChanged(businessId: UUID, type: AccountEventType): Promise<void>;
}
