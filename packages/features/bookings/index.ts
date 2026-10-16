/**
 * Booking core entry point: BookingService over the Supabase repository
 * (see docs/booking-core.md).
 */
import type { Db } from '../lib/db.ts';
import { createLogger } from '../lib/logger.ts';
import type { AppointmentEventsPort, BookingService, NotificationService } from '../ports.ts';
import { createSupabaseRepository } from '../repositories/supabase.ts';
import type { BookingRepository } from '../repositories/types.ts';
import { createBookingServiceFromRepository } from './services/bookingService.ts';

export { createBookingServiceFromRepository } from './services/bookingService.ts';
export type { BookingRepository } from '../repositories/types.ts';

export interface BookingDeps {
  db: Db;
  notifications: NotificationService;
  /** Outbound appointment lifecycle events (Nerova); see BookingServiceOptions.appointmentEvents */
  appointmentEvents?: AppointmentEventsPort;
  /** See BookingServiceOptions.defer */
  defer?: (task: () => Promise<unknown>) => void;
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
    defer: deps.defer,
    appointmentEvents: deps.appointmentEvents,
    logger: createLogger({ module: 'booking' }),
  });
}

/**
 * Anything that carries a `db`. Tests or an integrator may attach
 * `bookingRepository`; otherwise the Supabase repository over `db` is used.
 * (The API container satisfies this structurally, so features never import it.)
 */
export interface BookingContainer {
  db: Db;
  bookingRepository?: BookingRepository;
}

export function getBookingRepository(container: BookingContainer): BookingRepository {
  return container.bookingRepository ?? supabaseRepositoryFor(container.db);
}
