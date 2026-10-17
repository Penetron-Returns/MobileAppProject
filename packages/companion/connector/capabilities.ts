/** Optional connector capabilities, each declared to Nerova by publishing the matching tool (contract 2026-10-17). */

/** Nerova WhatsApp reminders: the client tapped "Confirm"; Nerova calls `appointments_confirm`. */
export const CONFIRM_APPOINTMENTS_CAPABILITY = 'ConfirmAppointments';

/** Nerova client tools (contract 2026-10-17). Capabilities are declared by publishing the tool, not by a flag. */
export const READ_CLIENTS_CAPABILITY = 'ReadClients';
export const SEARCH_CLIENTS_BY_NAME_CAPABILITY = 'SearchClientsByName';
export const CREATE_CLIENTS_CAPABILITY = 'CreateClients';

/** Act-then-undo: `origin.clientNotification` (hold on create, suppress on cancel) is honoured; declared by publishing it in the create schema. */
export const HOLD_CLIENT_NOTIFICATIONS_CAPABILITY = 'HoldClientNotifications';

type OriginSchema = { properties?: { origin?: { properties?: Record<string, unknown> } } };

/** Capabilities a published tool list declares: clients_search → ReadClients (+ SearchClientsByName with a name input), clients_create → CreateClients, appointments_confirm → ConfirmAppointments, an `origin.clientNotification` property on appointments_create → HoldClientNotifications. */
export function declaredToolCapabilities(tools: { name: string; inputSchema: unknown }[]): string[] {
  const search = tools.find((t) => t.name === 'clients_search');
  const hasHold = !!(tools.find((t) => t.name === 'appointments_create')?.inputSchema as OriginSchema | undefined)?.properties?.origin?.properties?.clientNotification;
  const hasName = !!(search?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties?.name;
  return [
    ...(search ? [READ_CLIENTS_CAPABILITY] : []),
    ...(search && hasName ? [SEARCH_CLIENTS_BY_NAME_CAPABILITY] : []),
    ...(tools.some((t) => t.name === 'clients_create') ? [CREATE_CLIENTS_CAPABILITY] : []),
    ...(tools.some((t) => t.name === 'appointments_confirm') ? [CONFIRM_APPOINTMENTS_CAPABILITY] : []),
    ...(hasHold ? [HOLD_CLIENT_NOTIFICATIONS_CAPABILITY] : []),
  ];
}
