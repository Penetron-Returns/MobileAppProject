/**
 * Nerova Booking connector, MCP transport: POST /connector/nerova/mcp.
 * The route authenticates the bearer token, parses JSON and delegates to the
 * pure MCP handler; business rules live in nerova/service.ts. It sits outside
 * /v1 on purpose: no Clerk, no CORS (server-to-server), and idempotency is the
 * tool's own `idempotencyKey` rather than a header.
 */
import { Buffer } from 'node:buffer';

import { Hono } from 'hono';

import { createBookingServiceFromRepository, getBookingRepository } from '@booking/features/bookings/index.ts';
import { isConfirmAppointmentsEnabled } from '@booking/companion/connector/capabilities.ts';
import { extractBearer, isValidConnectorToken } from '@booking/companion/connector/auth.ts';
import { handleMcpMessage } from '@booking/companion/connector/mcp.ts';
import { createNerovaConnectorService, type NerovaConnectorService } from '@booking/companion/connector/service.ts';
import { STATIC_READ_TTL_MS, withEntitlementCache, withStaticReadCache } from '@booking/companion/connector/staticReadCache.ts';
import type { Container } from '../container.ts';
import { withDbTiming } from '../lib/dbTiming.ts';
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

/**
 * One connector service per container (per warm isolate), so its read-through caches survive across requests.
 * Tests build a fresh container each, so they never share cache state.
 */
interface ConnectorRuntime {
  service: NerovaConnectorService;
  /** Drops this isolate's cached static reads and plan flags for one business */
  invalidate(businessId: string): void;
}
const runtimes = new WeakMap<Container, ConnectorRuntime>();

/** NEROVA_CONNECTOR_CACHE_TTL_MS: unset or invalid = 30 s, 0 = off. */
function cacheTtlMs(raw: string | undefined): number {
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : STATIC_READ_TTL_MS;
}

function connectorRuntime(container: Container): ConnectorRuntime {
  let runtime = runtimes.get(container);
  if (!runtime) {
    const ttl = cacheTtlMs(container.env.NEROVA_CONNECTOR_CACHE_TTL_MS);
    const reads = withStaticReadCache(getBookingRepository(container), { ttlMs: ttl });
    const entitlements = withEntitlementCache(container.entitlements, { ttlMs: ttl * 2 });
    const service = createNerovaConnectorService({
      booking: container.booking,
      // Reads of static data go through the cache; every write above still uses the live service.
      readBooking: createBookingServiceFromRepository({
        repository: reads.repo,
        notifications: { appointmentChanged: async () => undefined },
        clock: container.clock,
      }),
      entitlements,
      repo: reads.repo,
      clock: container.clock,
      confirmAppointmentsEnabled: isConfirmAppointmentsEnabled(container.env),
    });
    runtime = {
      service,
      invalidate: (businessId) => {
        reads.invalidate(businessId);
        entitlements.invalidate(businessId);
      },
    };
    runtimes.set(container, runtime);
  }
  return runtime;
}

/**
 * Cache-bust hook for our own writes (settings, catalogue, staff, hours, plan). Only this isolate is cleared;
 * other isolates catch up within the TTL. A no-op until the connector has served a request.
 */
export function invalidateConnectorCache(container: Container, businessId: string): void {
  runtimes.get(container)?.invalidate(businessId);
}

/** JSON-RPC method of a parsed message, for timing logs only (never arguments). */
const methodOf = (message: unknown): string =>
  message && typeof message === 'object' && typeof (message as { method?: unknown }).method === 'string'
    ? (message as { method: string }).method
    : 'invalid';

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

  const started = performance.now();
  const { result: outcome, stats } = await withDbTiming(() => handleMcpMessage(message, connectorRuntime(container).service));
  const total = Math.round(performance.now() - started);
  logger.info('connector_timing', {
    tool: outcome.tool?.name ?? methodOf(message),
    result: outcome.tool?.code ?? 'ok',
    total_ms: total,
    db_ms: Math.round(stats.ms),
    db_calls: stats.calls,
  });
  // Server-Timing: visible to Nerova (and curl -i) so a slow call can be attributed to us or the network.
  c.header('server-timing', `total;dur=${total}, db;dur=${Math.round(stats.ms)};desc="${stats.calls} queries"`);
  if (outcome.status === 202) return new Response(null, { status: 202, headers: { 'server-timing': `total;dur=${total}` } });
  return c.json(outcome.body as object, outcome.status);
});
