/** Post-commit publishing of appointment lifecycle events to an external platform (see AppointmentEventsPort). */
import type { Logger } from '../../lib/logger.ts';
import type { Actor, AppointmentEventKind, AppointmentEventsPort } from '../../ports.ts';
import type { AppointmentRow } from '../../repositories/rows.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import { toAppointmentDTO } from './mappers.ts';

export interface AppointmentEventPublisherOptions {
  repository: BookingRepository;
  events: AppointmentEventsPort | undefined;
  logger: Logger;
  /** Runs the publish after the response (edge: waitUntil). Omitted = awaited inline (tests, scripts). */
  defer: ((task: () => Promise<unknown>) => void) | undefined;
}

export type PublishAppointmentEvent = (row: AppointmentRow, kind: AppointmentEventKind, actor: Actor) => Promise<void>;

/** Never throws and never blocks the mutation: a failed publish is logged, the event row stays for audit. */
export function createAppointmentEventPublisher(options: AppointmentEventPublisherOptions): PublishAppointmentEvent {
  const { repository, events, logger, defer } = options;
  return async (row, kind, actor) => {
    if (!events?.enabled) return;
    const publish = async () => {
      try {
        const eventRowId = await repository.findLatestAppointmentEventId(row.id, kind);
        if (!eventRowId) {
          logger.warn('appointment_event_row_missing', { appointment_id: row.id, kind });
          return;
        }
        await events.appointmentChanged({ businessId: row.business_id, kind, appointment: toAppointmentDTO(row), actor, eventRowId });
      } catch (error) {
        logger.warn('appointment_event_failed', { appointment_id: row.id, kind, error });
      }
    };
    if (defer) defer(publish);
    else await publish();
  };
}
