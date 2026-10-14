import { createBookingService } from './booking/index.ts';
import { getEnv, type Env } from './env.ts';
import { getDb, type Db } from './lib/db.ts';
import { createAccountEvents, eventSenderFromEnv } from './nerova/events.ts';
import { createNotificationService } from './notifications/index.ts';
import { createEntitlementService } from './plans/entitlements.ts';
import type { AccountEventsPort, BookingService, EntitlementService, NotificationService } from './ports.ts';

/**
 * Composition root. Built once per warm function instance.
 * Tests build their own container with fakes via createContainer().
 */
export interface Container {
  env: Env;
  db: Db;
  booking: BookingService;
  notifications: NotificationService;
  entitlements: EntitlementService;
  nerovaEvents: AccountEventsPort;
  /** Injected clock for connector-level "now" (tests pin it) */
  clock: () => Date;
}

export function createContainer(env: Env, db: Db = getDb(env)): Container {
  const notifications = createNotificationService({ env, db });
  const booking = createBookingService({ env, db, notifications });
  const entitlements = createEntitlementService({ db });
  const nerovaEvents = createAccountEvents({ sender: eventSenderFromEnv(env), entitlements });
  return { env, db, booking, notifications, entitlements, nerovaEvents, clock: () => new Date() };
}

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= createContainer(getEnv());
  return cached;
}
