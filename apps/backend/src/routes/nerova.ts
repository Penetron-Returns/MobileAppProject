/**
 * Nerova Booking connector, MCP transport: POST /connector/nerova/mcp.
 * The route authenticates the bearer token, parses JSON and delegates to the
 * pure MCP handler; business rules live in nerova/service.ts. It sits outside
 * /v1 on purpose: no Clerk, no CORS (server-to-server), and idempotency is the
 * tool's own `idempotencyKey` rather than a header.
 */
import { Buffer } from 'node:buffer';

import { Hono } from 'hono';

import { getBookingRepository } from '../booking/index.ts';
import { extractBearer, isValidConnectorToken } from '../nerova/auth.ts';
import { handleMcpMessage } from '../nerova/mcp.ts';
import { createNerovaConnectorService } from '../nerova/service.ts';
import type { AppEnv } from '../types.ts';

const MAX_BODY_BYTES = 256 * 1024;

const problem = (status: number, title: string, code: string, detail: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title, status, detail, code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

const rpcFailure = (status: number, code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Reads the body as UTF-8 but stops as soon as it exceeds `limit` bytes; null means too large. */
async function readTextCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export const nerovaRoutes = new Hono<AppEnv>();

nerovaRoutes.all('/mcp', async (c) => {
  const container = c.get('container');
  const logger = c.get('logger');

  if (!isValidConnectorToken(extractBearer(c.req.header('authorization')), container.env)) {
    logger.warn('nerova_connector_unauthorized');
    const res = problem(401, 'Unauthorized', 'unauthorized', 'The bearer token is missing, wrong or revoked.');
    res.headers.set('www-authenticate', 'Bearer');
    return res;
  }
  // Nerova calls server to server; a browser Origin means a DNS-rebinding style request.
  if (c.req.header('origin')) return problem(403, 'Forbidden', 'unauthorized', 'Browser origins are not allowed.');
  if (c.req.method !== 'POST') {
    const res = problem(405, 'Method Not Allowed', 'invalid_request', 'Use POST with a JSON-RPC message.');
    res.headers.set('allow', 'POST');
    return res;
  }

  const text = await readTextCapped(c.req.raw, MAX_BODY_BYTES);
  if (text === null) return problem(413, 'Payload Too Large', 'invalid_request', 'Request body is too large.');
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return rpcFailure(400, -32700, 'Parse error');
  }

  const service = createNerovaConnectorService({
    booking: container.booking,
    entitlements: container.entitlements,
    repo: getBookingRepository(container),
    clock: container.clock,
  });
  const started = Date.now();
  const outcome = await handleMcpMessage(message, service);
  if (outcome.tool) {
    logger.info('nerova_tool_call', { tool: outcome.tool.name, result: outcome.tool.code, duration_ms: Date.now() - started });
  }
  if (outcome.status === 202) return new Response(null, { status: 202 });
  return c.json(outcome.body as object, outcome.status);
});
