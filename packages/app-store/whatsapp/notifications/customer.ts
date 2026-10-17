/**
 * Customer-facing appointment messages: a session message (interactive, with
 * a Manage/Book button) while the 24h window is open, otherwise the matching
 * approved utility template from packages/app-store/whatsapp/assets/templates.json.
 */
import type { AppointmentChangeKind } from '@booking/features/ports.ts';
import { COPY } from '../engine/copy.ts';
import { longDate, summaryLines, timeOf } from '../format.ts';
import { rid } from '../ids.ts';
import { buttons, template, type OutMessage } from '../messages.ts';
import type { AppointmentBrief, BusinessBrief } from '../repo.ts';
import type { NerovaNotification } from './nerovaChannel.ts';

const TEMPLATE_BY_KIND = {
  created: 'booking_confirmation',
  rescheduled: 'booking_rescheduled',
  cancelled: 'booking_cancelled',
} as const satisfies Record<AppointmentChangeKind, string>;

/** "Tue 30 Sep 2026 at 09:00" in the business timezone. */
export function whenText(startsAt: string, tz: string): string {
  return `${longDate(startsAt, tz)} at ${timeOf(startsAt, tz)}`;
}

/** Body parameters shared by all four templates: business, service, when, staff. */
export function templateParams(appt: AppointmentBrief, business: BusinessBrief): string[] {
  return [business.name, appt.service_name ?? 'your appointment', whenText(appt.starts_at, business.timezone), appt.staff_name ?? 'our team'];
}

export function appointmentMessage(kind: AppointmentChangeKind, appt: AppointmentBrief, business: BusinessBrief, windowOpen: boolean): OutMessage {
  const nextStep = kind === 'cancelled' ? rid.menu('book') : rid.appt('open', appt.id);
  if (!windowOpen) return template(TEMPLATE_BY_KIND[kind], templateParams(appt, business), [nextStep]);

  const summary = summaryLines(
    { service: appt.service_name ?? 'Appointment', startsAt: appt.starts_at, staff: appt.staff_name },
    business.timezone,
  );
  if (kind === 'cancelled') return buttons(COPY.cancelled(summary), [{ id: nextStep, title: COPY.bookAgain }]);
  const body = kind === 'created' ? COPY.booked(summary) : COPY.rescheduled(summary);
  return buttons(body, [{ id: nextStep, title: COPY.manageBooking }]);
}

/** Reminder template with Keep / Reschedule / Cancel quick replies. */
export function reminderMessage(appt: AppointmentBrief, business: BusinessBrief): OutMessage {
  return template('booking_reminder', templateParams(appt, business), [
    rid.appt('keep', appt.id),
    rid.appt('resched', appt.id),
    rid.appt('cancel', appt.id),
  ]);
}

/** Push copy for staff devices: what happened and when, never who. */
export function staffPush(kind: AppointmentChangeKind, appt: AppointmentBrief, business: BusinessBrief) {
  const title = kind === 'created' ? 'New booking' : kind === 'rescheduled' ? 'Booking moved' : 'Booking cancelled';
  const service = appt.service_name ?? 'Appointment';
  return {
    title,
    body: `${service}, ${whenText(appt.starts_at, business.timezone)}`,
    data: { type: 'appointment', appointment_id: appt.id, kind },
  };
}

/**
 * The same three changes as `appointmentMessage`, as a Nerova notification (numbers on Nerova). Nerova has no
 * "booked" or "moved" template with our fields, so those travel as a free `update`; cancellations have their own type.
 */
export function nerovaNotification(
  kind: AppointmentChangeKind,
  appt: AppointmentBrief,
  business: BusinessBrief,
  client: { name: string | null; phone_e164: string },
): NerovaNotification {
  const service = appt.service_name ?? 'your appointment';
  const when = whenText(appt.starts_at, business.timezone);
  const base = { to: client.phone_e164, clientName: client.name ?? 'there', businessName: business.name, serviceName: service, when };
  if (kind === 'cancelled') return { ...base, type: 'cancelled' };
  const withStaff = appt.staff_name ? ` with ${appt.staff_name}` : '';
  const message = kind === 'created' ? `Your ${service} is booked for ${when}${withStaff}.` : `Your ${service} has been moved to ${when}${withStaff}.`;
  return { ...base, type: 'update', message };
}
