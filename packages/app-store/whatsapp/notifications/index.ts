/**
 * NotificationService (ports.ts): tells the customer about an appointment
 * change on WhatsApp and pushes the business's devices when the customer
 * made the change. It never throws; delivery failures are logged and, for
 * booking-critical messages, escalated to staff (see whatsapp/outbound.ts).
 */
import type { Db } from '@booking/features/lib/db.ts';
import type { AppointmentChangedEvent, NotificationService } from '@booking/features/ports.ts';
import { buildOutboundDeps, type OutboundDeps, type WhatsAppEnv } from '../deps.ts';
import { confirmationDedupeKey } from '../engine/transition.ts';
import { sendOutbound } from '../outbound.ts';
import type { AppointmentBrief, BusinessBrief } from '../repo.ts';
import { appointmentMessage, staffPush } from './customer.ts';

export interface NotificationDeps {
  env: WhatsAppEnv;
  db: Db;
  /** Test overrides (repository, Graph client, push, clock) */
  overrides?: Partial<OutboundDeps>;
}

export type NotifyOutcome = 'sent' | 'skipped' | 'failed';

export function createNotificationService(input: NotificationDeps): NotificationService {
  let deps: OutboundDeps | undefined;
  const get = () => (deps ??= buildOutboundDeps({ env: input.env, db: input.db, overrides: input.overrides }));
  return {
    async appointmentChanged(event) {
      const d = get();
      try {
        await notifyAppointmentChanged(d, event);
      } catch (err) {
        d.logger.error('notification_failed', { appointment_id: event.appointmentId, kind: event.kind, error: err });
      }
    },
  };
}

export async function notifyAppointmentChanged(deps: OutboundDeps, event: AppointmentChangedEvent): Promise<NotifyOutcome> {
  const appt = await deps.repo.getAppointmentBrief(event.businessId, event.appointmentId);
  const business = appt ? await deps.repo.getBusinessBrief(event.businessId) : null;
  if (!appt || !business) return 'skipped';

  if (event.actor.type === 'customer' || event.actor.type === 'nerova') {
    await deps.push.toBusiness(event.businessId, staffPush(event.kind, appt, business));
  }
  if (!event.notifyCustomer) return 'skipped';
  return notifyCustomer(deps, event, appt, business);
}

async function notifyCustomer(
  deps: OutboundDeps,
  event: AppointmentChangedEvent,
  appt: AppointmentBrief,
  business: BusinessBrief,
): Promise<NotifyOutcome> {
  const skip = (reason: string): NotifyOutcome => {
    deps.logger.info('notification_skipped', { appointment_id: appt.id, kind: event.kind, reason });
    return 'skipped';
  };
  const client = await deps.repo.getClient(event.businessId, appt.client_id);
  if (!client) return skip('no_client');
  if (client.is_blocked || !client.whatsapp_opt_in) return skip('client_opted_out');
  const account = await deps.repo.getAccountByBusiness(event.businessId);
  if (!account || account.status !== 'live') return skip('channel_not_live');

  const conv = await deps.repo.getOrCreateConversation(event.businessId, client.id);
  const windowOpen = !!conv.window_expires_at && Date.parse(conv.window_expires_at) > deps.now().getTime();
  const message = appointmentMessage(event.kind, appt, business, windowOpen);
  const outcome = await sendOutbound(
    deps,
    { account, businessId: event.businessId, conversationId: conv.id, clientId: client.id, to: client.phone_e164 },
    message,
    {
      dedupeKey: confirmationDedupeKey(event.kind, appt),
      critical: true,
      confirmation: { appointmentId: appt.id, kind: event.kind },
    },
  );
  return outcome.status;
}
