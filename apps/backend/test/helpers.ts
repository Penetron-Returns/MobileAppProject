import type { Container } from '../src/container.ts';
import type { Env } from '../src/env.ts';
import type { Db } from '../src/lib/db.ts';
import type { IdempotencyRecord, IdempotencyStore } from '../src/middleware/idempotency.ts';
import type { BookingService, EntitlementService, NotificationService } from '../src/ports.ts';
import type { FeatureKey, PlanKey } from '../../../packages/shared/api.ts';

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

/**
 * Mirror of the plan_features seed in supabase/migrations/20261014000001_plan_flags.sql
 * (a test asserts the two stay identical).
 */
export const PLAN_FEATURES: Record<PlanKey, FeatureKey[]> = {
  free: ['whatsapp_menu', 'inbox', 'extensions'],
  starter: ['companion', 'desktop_app', 'extensions', 'assistant_bookings'],
  growth: ['companion', 'desktop_app', 'extensions', 'assistant_bookings'],
  pro: ['companion', 'desktop_app', 'extensions', 'assistant_bookings'],
};

/** In-memory EntitlementService for one plan; `limits` sets monthly caps per feature. */
export function fakeEntitlements(plan: PlanKey = 'free', limits: Partial<Record<FeatureKey, number>> = {}): EntitlementService {
  const get = async () => ({
    plan,
    features: PLAN_FEATURES[plan].map((feature) => ({ feature, monthly_limit: limits[feature] ?? null })),
  });
  return {
    getEntitlements: get,
    async hasFeature(_businessId, feature) {
      return PLAN_FEATURES[plan].includes(feature);
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
    // Free plan = the WhatsApp menu + inbox, which is what the existing suites exercise.
    entitlements: fakeEntitlements('free'),
    ...overrides,
  };
}
