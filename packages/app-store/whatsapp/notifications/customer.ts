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
