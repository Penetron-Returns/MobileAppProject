/**
 * Client-message channel for businesses whose WhatsApp number lives on Nerova. We cannot send from that number
 * through our own Meta integration, so every client message goes through Nerova's notifications API instead.
 * This is only the port (dependency inversion): the HTTP implementation is in
 * packages/companion/nerova/clientChannel.ts and is wired in apps/api/src/container.ts.
 */
import type { AppointmentChangeKind } from '@booking/features/ports.ts';

/** What Nerova's `POST /v1/accounts/{id}/notifications` needs for the types we use (reminders are Nerova's own sweep). */
export interface NerovaNotification {
  /** Client phone, E.164 */
  to: string;
  /** `update` carries a free `message` (booked / moved); `cancelled` has its own template */
  type: 'update' | 'cancelled';
  clientName: string;
  businessName: string;
  serviceName: string;
  /** Human time in the business timezone */
  when: string;
  /** `update` only */
  message?: string;
}

export type NerovaSendOutcome = 'sent' | 'opted_out';

export interface NerovaClientChannel {
  /** True when this business's WhatsApp number is on Nerova (companion plan): our own Meta path must stay silent. */
  ownsNumber(businessId: string): Promise<boolean>;
  /** Idempotent on `idempotencyKey`. Throws AppError on failure (never logs the message). */
  send(businessId: string, notification: NerovaNotification, idempotencyKey: string): Promise<NerovaSendOutcome>;
}

/** Deterministic per (appointment, change): a retried hold job or notify never sends twice. */
export function nerovaIdempotencyKey(kind: AppointmentChangeKind, appt: { id: string; starts_at: string }): string {
  const start = kind === 'created' ? '' : `-${new Date(appt.starts_at).getTime()}`;
  return `appt-${kind}-${appt.id}${start}`;
}
