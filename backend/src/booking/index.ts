// STUB — WS-B replaces with the real implementation (availability engine + booking service).
import type { Env } from '../env';
import type { Db } from '../lib/db';
import type { BookingService, NotificationService } from '../ports';

export interface BookingDeps {
  env: Env;
  db: Db;
  notifications: NotificationService;
}

export function createBookingService(_deps: BookingDeps): BookingService {
  const notImplemented = (): never => {
    throw new Error('BookingService not implemented');
  };
  return {
    getBusiness: notImplemented,
    listServices: notImplemented,
    listBookableStaff: notImplemented,
    listAvailableDays: notImplemented,
    listAvailableSlots: notImplemented,
    createAppointment: notImplemented,
    rescheduleAppointment: notImplemented,
    cancelAppointment: notImplemented,
    getAppointment: notImplemented,
    listUpcomingForClient: notImplemented,
  };
}
