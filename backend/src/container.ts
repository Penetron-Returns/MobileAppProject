import { createBookingService } from './booking';
import { getEnv, type Env } from './env';
import { getDb, type Db } from './lib/db';
import { createNotificationService } from './notifications';
import type { BookingService, NotificationService } from './ports';

/**
 * Composition root. Built once per warm function instance.
 * Tests build their own container with fakes via createContainer().
 */
export interface Container {
  env: Env;
  db: Db;
  booking: BookingService;
  notifications: NotificationService;
}

export function createContainer(env: Env, db: Db = getDb(env)): Container {
  const notifications = createNotificationService({ env, db });
  const booking = createBookingService({ env, db, notifications });
  return { env, db, booking, notifications };
}

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= createContainer(getEnv());
  return cached;
}
