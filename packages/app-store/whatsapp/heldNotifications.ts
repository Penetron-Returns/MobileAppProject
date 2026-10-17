/**
 * Act-then-undo hold job (/cron/client-notifications, every minute). A booking made by the companion with a hold
 * (`appointments.client_notify_after`) tells the client nothing until the owner's undo window has passed. Here the
 * due holds are claimed atomically (the claim clears the field, so each is handled once) and, when the appointment
 * is still confirmed, the normal 'created' message goes out through the same notification path: our Meta number, or
 * Nerova's notifications API for numbers on Nerova. A cancelled or voided appointment just has its hold cleared.
 */
import { notifyAppointmentChanged } from './notifications/index.ts';
import { getWaDeps, type WaContainer, type WaDeps } from './deps.ts';

const HELD_BATCH = 100;

export async function runHeldClientNotifications(deps: WaDeps) {
  const counts = { claimed: 0, sent: 0, skipped: 0, failed: 0, cleared: 0 };
  for (const claim of await deps.repo.claimDueClientNotifications(deps.now().toISOString(), HELD_BATCH)) {
    counts.claimed += 1;
    if (claim.voided || claim.status !== 'confirmed') {
      counts.cleared += 1;
      continue;
    }
    try {
      const outcome = await notifyAppointmentChanged(deps, {
        businessId: claim.business_id,
        appointmentId: claim.appointment_id,
        kind: 'created',
        actor: { type: 'system', id: null },
        notifyCustomer: true,
        skipStaffPush: true, // staff already got "New booking" when it was made
      });
      counts[outcome] += 1;
    } catch (err) {
      deps.logger.error('held_client_notification_failed', { appointment_id: claim.appointment_id, error: err });
      counts.failed += 1;
    }
  }
  return counts;
}

export const runHeldClientNotificationsJob = async (container: WaContainer, now?: Date) => {
  const deps = getWaDeps(container);
  return runHeldClientNotifications(now ? { ...deps, now: () => now } : deps);
};
