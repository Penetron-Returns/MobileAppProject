/**
 * Tool registry: published definitions (exact copy of Nerova's
 * booking-connector.mcp-tools.json) joined to their argument schema and handler.
 * Adding an optional extra tool means adding it to optionalTools in the JSON and an entry here (open/closed).
 */
import type { z } from 'zod';

import { argSchemas, type ToolName } from './args.ts';
import definitions from './booking-connector.mcp-tools.json' with { type: 'json' };
import type { NerovaConnectorService } from './service.ts';

export const CONTRACT_VERSION: string = definitions.contractVersion;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: { readOnlyHint: boolean };
}

/** Required tools only, exactly as Nerova certifies them. */
export const REQUIRED_TOOL_DEFINITIONS = definitions.tools as ToolDefinition[];
/** Optional tools: publishing one declares its capability (see capabilities.ts). */
export const OPTIONAL_TOOL_DEFINITIONS = definitions.optionalTools as ToolDefinition[];
/** What tools/list publishes. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [...REQUIRED_TOOL_DEFINITIONS, ...OPTIONAL_TOOL_DEFINITIONS];

type Handler = (service: NerovaConnectorService, args: never) => Promise<unknown>;

interface ToolBinding {
  schema: z.ZodType;
  handler: Handler;
}

/** One binding per published tool, keyed by its name. */
export const TOOL_BINDINGS: Record<ToolName, ToolBinding> = {
  accounts_list: { schema: argSchemas.accounts_list, handler: (s, a) => s.accountsList(a) },
  accounts_get: { schema: argSchemas.accounts_get, handler: (s, a) => s.accountsGet(a) },
  services_list: { schema: argSchemas.services_list, handler: (s, a) => s.servicesList(a) },
  staff_list: { schema: argSchemas.staff_list, handler: (s, a) => s.staffList(a) },
  availability_search: { schema: argSchemas.availability_search, handler: (s, a) => s.availabilitySearch(a) },
  availability_free_time: { schema: argSchemas.availability_free_time, handler: (s, a) => s.availabilityFreeTime(a) },
  appointments_get: { schema: argSchemas.appointments_get, handler: (s, a) => s.appointmentsGet(a) },
  appointments_list: { schema: argSchemas.appointments_list, handler: (s, a) => s.appointmentsList(a) },
  appointments_create: { schema: argSchemas.appointments_create, handler: (s, a) => s.appointmentsCreate(a) },
  appointments_reschedule: { schema: argSchemas.appointments_reschedule, handler: (s, a) => s.appointmentsReschedule(a) },
  appointments_cancel: { schema: argSchemas.appointments_cancel, handler: (s, a) => s.appointmentsCancel(a) },
  appointments_confirm: { schema: argSchemas.appointments_confirm, handler: (s, a) => s.confirmAppointment(a) },
  clients_search: { schema: argSchemas.clients_search, handler: (s, a) => s.clientsSearch(a) },
  clients_create: { schema: argSchemas.clients_create, handler: (s, a) => s.clientsCreate(a) },
};

export const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOL_BINDINGS, name);
