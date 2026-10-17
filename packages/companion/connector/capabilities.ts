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

/** Nerova client tools (contract 2026-10-17). Capabilities are declared by publishing the tool, not by a flag. */
export const READ_CLIENTS_CAPABILITY = 'ReadClients';
export const SEARCH_CLIENTS_BY_NAME_CAPABILITY = 'SearchClientsByName';
export const CREATE_CLIENTS_CAPABILITY = 'CreateClients';

/** Act-then-undo: `origin.clientNotification` (hold on create, suppress on cancel) is honoured; declared by publishing it in the create schema. */
export const HOLD_CLIENT_NOTIFICATIONS_CAPABILITY = 'HoldClientNotifications';

type OriginSchema = { properties?: { origin?: { properties?: Record<string, unknown> } } };

/** Capabilities a published tool list declares: clients_search → ReadClients (+ SearchClientsByName with a name input), clients_create → CreateClients, an `origin.clientNotification` property on appointments_create → HoldClientNotifications. */
export function declaredToolCapabilities(tools: { name: string; inputSchema: unknown }[]): string[] {
  const search = tools.find((t) => t.name === 'clients_search');
  const hasHold = !!(tools.find((t) => t.name === 'appointments_create')?.inputSchema as OriginSchema | undefined)?.properties?.origin?.properties?.clientNotification;
  const hasName = !!(search?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties?.name;
  return [
    ...(search ? [READ_CLIENTS_CAPABILITY] : []),
    ...(search && hasName ? [SEARCH_CLIENTS_BY_NAME_CAPABILITY] : []),
    ...(tools.some((t) => t.name === 'clients_create') ? [CREATE_CLIENTS_CAPABILITY] : []),
    ...(hasHold ? [HOLD_CLIENT_NOTIFICATIONS_CAPABILITY] : []),
  ];
}

/** Optional capabilities to advertise, given the flags. Empty while every flag is off. */
export function advertisedCapabilities(flags: { confirmAppointments: boolean }): string[] {
  return flags.confirmAppointments ? [CONFIRM_APPOINTMENTS_CAPABILITY] : [];
}
