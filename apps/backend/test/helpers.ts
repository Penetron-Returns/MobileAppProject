import type { Container } from '../src/container.ts';
import type { Env } from '../src/env.ts';
import type { Db } from '../src/lib/db.ts';
import type { IdempotencyRecord, IdempotencyStore } from '../src/middleware/idempotency.ts';
import type { BookingService, NotificationService } from '../src/ports.ts';

export const TEST_ENV: Env = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  META_GRAPH_VERSION: 'v23.0',
  CRON_SECRET: 'cron-secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  FLOW_TOKEN_SECRET: 'flow-secret',
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
  META_APP_SECRET: 'app-secret',
} as Env;

export function memoryIdempotencyStore(): IdempotencyStore & { records: Map<string, IdempotencyRecord> } {
  const records = new Map<string, IdempotencyRecord>();
  return {
    records,
    async get(key) {
      return records.get(key) ?? null;
    },
    async reserve(r) {
      if (records.has(r.key)) return false;
      records.set(r.key, { ...r, status_code: null, response: null });
      return true;
    },
    async complete(key, status_code, response) {
      const r = records.get(key);
      if (r) records.set(key, { ...r, status_code, response });
    },
    async release(key) {
      records.delete(key);
    },
  };
}

/** Builds a container with fakes; override only what a test needs. */
export function testContainer(overrides: Partial<Container> = {}): Container {
  const unimplemented = new Proxy({}, {
    get: (_t, prop) => () => {
      throw new Error(`fake not configured: ${String(prop)}`);
    },
  });
  return {
    env: TEST_ENV,
    db: unimplemented as Db,
    booking: unimplemented as BookingService,
    notifications: { appointmentChanged: async () => {} } satisfies NotificationService,
    ...overrides,
  };
}
