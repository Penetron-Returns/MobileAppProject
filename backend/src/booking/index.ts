/**
 * Booking core entry point: availability engine + BookingService
 * (see docs/booking-core.md).
 */
import type { Container } from '../container';
import type { Env } from '../env';
import type { Db } from '../lib/db';
import { createLogger } from '../lib/logger';
import type { BookingService, NotificationService } from '../ports';
import { createSupabaseRepository, type BookingRepository } from './repository';
import { createBookingServiceFromRepository } from './service';

export { createBookingServiceFromRepository } from './service';
export { createMemoryRepository } from './memoryRepository';
export type { BookingRepository } from './repository';

export interface BookingDeps {
  env: Env;
  db: Db;
  notifications: NotificationService;
}

const repositories = new WeakMap<object, BookingRepository>();

function supabaseRepositoryFor(db: Db): BookingRepository {
  let repo = repositories.get(db);
  if (!repo) {
    repo = createSupabaseRepository(db);
    repositories.set(db, repo);
  }
  return repo;
}

export function createBookingService(deps: BookingDeps): BookingService {
  return createBookingServiceFromRepository({
    repository: supabaseRepositoryFor(deps.db),
    notifications: deps.notifications,
    logger: createLogger({ module: 'booking' }),
  });
}

/**
 * Additive container extension (documented deviation): tests or an
 * integrator may attach `bookingRepository`; otherwise the Supabase
 * repository over `container.db` is used.
 */
export type BookingContainer = Container & { bookingRepository?: BookingRepository };

export function getBookingRepository(container: Container): BookingRepository {
  return (container as BookingContainer).bookingRepository ?? supabaseRepositoryFor(container.db);
}
