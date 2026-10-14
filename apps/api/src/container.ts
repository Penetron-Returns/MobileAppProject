import { createBookingService } from '@booking/features/bookings/index.ts';
import { getEnv, type Env } from './env.ts';
import { createClerkAdmin } from '@booking/features/team/lib/clerkAdmin.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { getDb } from './lib/db.ts';
import { createAccountEvents, eventSenderFromEnv } from '@booking/companion/events/events.ts';
import { createNotificationService } from '@booking/app-store/whatsapp/notifications/index.ts';
import { createEntitlementService } from '@booking/features/plans/services/entitlements.ts';
import type { AccountEventsPort, BookingService, ClerkAdmin, EntitlementService, NotificationService } from '@booking/features/ports.ts';

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
  /** Clerk Backend API (organisation members and invitations) */
  clerkAdmin: ClerkAdmin;
  /** Injected clock for connector-level "now" (tests pin it) */
  clock: () => Date;
}

export function createContainer(env: Env, db: Db = getDb(env)): Container {
  const notifications = createNotificationService({ env, db });
  const booking = createBookingService({ db, notifications });
  const entitlements = createEntitlementService({ db });
  const nerovaEvents = createAccountEvents({ sender: eventSenderFromEnv(env), entitlements });
  const clerkAdmin = createClerkAdmin({ secretKey: env.CLERK_SECRET_KEY });
  return { env, db, booking, notifications, entitlements, nerovaEvents, clerkAdmin, clock: () => new Date() };
}

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= createContainer(getEnv());
  return cached;
}
