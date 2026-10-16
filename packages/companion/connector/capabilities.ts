/**
 * Optional connector capabilities. A capability is only advertised (manifest, wire fields) when its flag is on, so
 * the shipped contract and the conformance shape stay exactly as Nerova certified them until Nerova confirms a new one.
 */

/** Nerova WhatsApp reminders: the client tapped "Confirm"; Nerova calls `appointments_confirm`. */
export const CONFIRM_APPOINTMENTS_CAPABILITY = 'confirm_appointments';

/** NEROVA_CONFIRM_APPOINTMENTS_ENABLED: only the literal "true" turns it on (default off). */
export function isConfirmAppointmentsEnabled(env: { NEROVA_CONFIRM_APPOINTMENTS_ENABLED?: string }): boolean {
  return env.NEROVA_CONFIRM_APPOINTMENTS_ENABLED === 'true';
}

/** Optional capabilities to advertise, given the flags. Empty while every flag is off. */
export function advertisedCapabilities(flags: { confirmAppointments: boolean }): string[] {
  return flags.confirmAppointments ? [CONFIRM_APPOINTMENTS_CAPABILITY] : [];
}
