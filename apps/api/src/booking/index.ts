/**
 * Booking core entry point: availability engine + BookingService
 * (see docs/booking-core.md).
 */
import type { Container } from '../container.ts';
import type { Env } from '../env.ts';
import type { Db } from '../lib/db.ts';
import { createLogger } from '../lib/logger.ts';
import type { BookingService, NotificationService } from '../ports.ts';
import { createSupabaseRepository, type BookingRepository } from './repository.ts';
import { createBookingServiceFromRepository } from './service.ts';

export { createBookingServiceFromRepository } from './service.ts';
export { createMemoryRepository } from './memoryRepository.ts';
export type { BookingRepository } from './repository.ts';

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
