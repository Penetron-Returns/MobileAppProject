/**
 * Signed appointment events to Nerova (same Standard Webhooks envelope as account events). OFF by default:
 * Nerova has not confirmed this contract yet, so the names and the data shape live in this one file.
 * Enabled only with NEROVA_APPOINTMENT_EVENTS_ENABLED=true plus the events URL and signing secret.
 */
import type { Logger } from '@booking/features/lib/logger.ts';
import { createLogger } from '@booking/features/lib/logger.ts';
import type {
  AppointmentEventKind,
  AppointmentEventsPort,
  AppointmentLifecycleEvent,
  EntitlementService,
} from '@booking/features/ports.ts';
import { disabledEventSender, eventSenderFromEnv, type AccountEventSender, type EventsEnv } from './events.ts';

/** Wire names, one place to change when Nerova confirms the contract. */
export const APPOINTMENT_EVENT_TYPES = {
  created: 'appointment.created',
  rescheduled: 'appointment.rescheduled',
  cancelled: 'appointment.cancelled',
  completed: 'appointment.completed',
  no_show: 'appointment.no_show',
} as const satisfies Record<AppointmentEventKind, string>;

export type AppointmentEventType = (typeof APPOINTMENT_EVENT_TYPES)[AppointmentEventKind];

/** Prefix of the outbound event id; the rest is the `appointment_events` row id, so a retry reuses the same id. */
export const APPOINTMENT_EVENT_ID_PREFIX = 'evt_apt_';

/** Changes made by Nerova itself are not echoed back (they would loop). */
const EXCLUDED_ACTORS: ReadonlySet<string> = new Set(['nerova']);

export interface AppointmentEventsEnv extends EventsEnv {
  readonly NEROVA_APPOINTMENT_EVENTS_ENABLED?: string | undefined;
}

export interface AppointmentEventsDeps {
  sender: AccountEventSender;
  entitlements: EntitlementService;
  logger?: Logger;
  clock?: () => Date;
}

export function createAppointmentEvents(deps: AppointmentEventsDeps): AppointmentEventsPort {
  const logger = deps.logger ?? createLogger({ module: 'nerova_appointment_events' });
  const clock = deps.clock ?? (() => new Date());
  return {
    enabled: true,
    async appointmentChanged(event: AppointmentLifecycleEvent) {
      try {
        if (EXCLUDED_ACTORS.has(event.actor.type)) return;
        // Same rule as account events: a business without the companion is never exposed to Nerova.
        if (!(await deps.entitlements.hasFeature(event.businessId, 'companion'))) return;
        const { appointment } = event;
        await deps.sender.send({
          id: `${APPOINTMENT_EVENT_ID_PREFIX}${event.eventRowId}`,
          type: APPOINTMENT_EVENT_TYPES[event.kind],
          createdAt: clock().toISOString(),
          data: {
            id: appointment.id,
            accountId: event.businessId,
            startsAt: appointment.starts_at,
            status: appointment.status,
            source: appointment.source,
          },
        });
      } catch (error) {
        logger.warn('nerova_appointment_event_failed', { business_id: event.businessId, kind: event.kind, error });
      }
    },
  };
}

/** Off unless NEROVA_APPOINTMENT_EVENTS_ENABLED is exactly "true" and the events URL + secret are valid. */
export function appointmentEventsFromEnv(
  env: AppointmentEventsEnv,
  entitlements: EntitlementService,
  logger?: Logger,
): AppointmentEventsPort {
  const off: AppointmentEventsPort = { enabled: false, async appointmentChanged() {} };
  if (env.NEROVA_APPOINTMENT_EVENTS_ENABLED !== 'true') return off;
  // Reuses the account-events URL, secret and https rules; independent of NEROVA_EVENTS_ENABLED.
  const sender = eventSenderFromEnv({ ...env, NEROVA_EVENTS_ENABLED: 'true' }, logger);
  if (sender === disabledEventSender) return off;
  return createAppointmentEvents({ sender, entitlements, ...(logger ? { logger } : {}) });
}
