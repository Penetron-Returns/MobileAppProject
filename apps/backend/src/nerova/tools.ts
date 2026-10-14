/**
 * Tool registry: published definitions (exact copy of Nerova's
 * booking-connector.mcp-tools.json) joined to their argument schema and handler.
 * Adding an optional extra tool means adding an entry here (open/closed).
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

export const TOOL_DEFINITIONS = definitions.tools as ToolDefinition[];

type Handler = (service: NerovaConnectorService, args: never) => Promise<unknown>;

interface ToolBinding {
  schema: z.ZodType;
  handler: Handler;
}

/** One binding per required tool, keyed by the published tool name. */
export const TOOL_BINDINGS: Record<ToolName, ToolBinding> = {
  accounts_list: { schema: argSchemas.accounts_list, handler: (s, a) => s.accountsList(a) },
  accounts_get: { schema: argSchemas.accounts_get, handler: (s, a) => s.accountsGet(a) },
  services_list: { schema: argSchemas.services_list, handler: (s, a) => s.servicesList(a) },
  staff_list: { schema: argSchemas.staff_list, handler: (s, a) => s.staffList(a) },
  availability_search: { schema: argSchemas.availability_search, handler: (s, a) => s.availabilitySearch(a) },
  appointments_get: { schema: argSchemas.appointments_get, handler: (s, a) => s.appointmentsGet(a) },
  appointments_list: { schema: argSchemas.appointments_list, handler: (s, a) => s.appointmentsList(a) },
  appointments_create: { schema: argSchemas.appointments_create, handler: (s, a) => s.appointmentsCreate(a) },
  appointments_reschedule: { schema: argSchemas.appointments_reschedule, handler: (s, a) => s.appointmentsReschedule(a) },
  appointments_cancel: { schema: argSchemas.appointments_cancel, handler: (s, a) => s.appointmentsCancel(a) },
};

export const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOL_BINDINGS, name);
