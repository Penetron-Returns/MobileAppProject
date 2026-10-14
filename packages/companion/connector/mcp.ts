/**
 * Minimal stateless MCP server (streamable HTTP, JSON replies) for the Nerova
 * Booking connector. Nerova sends `initialize`, `notifications/initialized`,
 * `tools/list` and `tools/call` as JSON-RPC POSTs; we answer each with one
 * JSON body and no session (no Mcp-Session-Id), which the spec allows.
 *
 * Pure: transport (auth, status codes, logging) lives in routes/nerova.ts.
 */
import { z } from 'zod';

import { invalidRequest, toConnectorError, type ConnectorError } from './errors.ts';
import type { NerovaConnectorService } from './service.ts';
import { isToolName, TOOL_BINDINGS, TOOL_DEFINITIONS } from './tools.ts';

export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const SERVER_INFO = { name: 'booking-nerova-connector', version: '1.0.0' };

const RpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

type RpcId = string | number | null;

const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0' as const, id, error: { code, message } });

/** A tool failure is a tool result with isError, never a JSON-RPC error (Nerova reads `code`). */
export function toolError(error: ConnectorError) {
  const structuredContent = {
    code: error.code,
    detail: error.message,
    ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
  };
  return { isError: true, structuredContent, content: [{ type: 'text', text: error.code }] };
}

const toolSuccess = (result: unknown) => ({
  structuredContent: result,
  content: [{ type: 'text', text: JSON.stringify(result) }],
});

export interface McpOutcome {
  /** HTTP status: 200 with a body, 202 (no body) for notifications */
  status: 200 | 202;
  body?: unknown;
  /** Tool name and result code for logging (never arguments) */
  tool?: { name: string; code: string };
}

export async function handleMcpMessage(raw: unknown, service: NerovaConnectorService): Promise<McpOutcome> {
  const parsed = RpcRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: 200, body: rpcError(null, -32600, 'Invalid JSON-RPC request') };
  const { id, method, params } = parsed.data;

  // Notifications and client responses carry no id: acknowledge, do nothing.
  if (id === undefined) return { status: 202 };

  switch (method) {
    case 'initialize': {
      const requested = typeof params?.protocolVersion === 'string' ? params.protocolVersion : '';
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
      return {
        status: 200,
        body: rpcResult(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO }),
      };
    }
    case 'ping':
      return { status: 200, body: rpcResult(id, {}) };
    case 'tools/list':
      return { status: 200, body: rpcResult(id, { tools: TOOL_DEFINITIONS }) };
    case 'tools/call':
      return callTool(id, params, service);
    default:
      return { status: 200, body: rpcError(id, -32601, `Method not found: ${method}`) };
  }
}

async function callTool(id: RpcId, params: Record<string, unknown> | undefined, service: NerovaConnectorService): Promise<McpOutcome> {
  const name = params?.name;
  if (typeof name !== 'string' || !isToolName(name)) return { status: 200, body: rpcError(id, -32602, 'Unknown tool') };

  const binding = TOOL_BINDINGS[name];
  const args = binding.schema.safeParse(params?.arguments ?? {});
  if (!args.success) {
    const issue = args.error.issues[0];
    const field = issue?.path.join('.') || 'arguments';
    const error = invalidRequest(`${field}: ${issue?.message ?? 'invalid'}`);
    return { status: 200, body: rpcResult(id, toolError(error)), tool: { name, code: error.code } };
  }
  try {
    const result = await binding.handler(service, args.data as never);
    return { status: 200, body: rpcResult(id, toolSuccess(result)), tool: { name, code: 'ok' } };
  } catch (cause) {
    const error = toConnectorError(cause);
    return { status: 200, body: rpcResult(id, toolError(error)), tool: { name, code: error.code } };
  }
}
