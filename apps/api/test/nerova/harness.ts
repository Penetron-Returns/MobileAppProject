import { createApp } from '../../src/app.ts';
import { createBookingServiceFromRepository } from '@booking/features/bookings/services/bookingService.ts';
import { sha256Hex } from '@booking/features/lib/crypto.ts';
import { notFound } from '@booking/features/lib/errors.ts';
import type { Env } from '../../src/env.ts';
import type { AccountEventsPort, AppointmentChangedEvent, BookingService, EntitlementService } from '@booking/features/ports.ts';
import type { FeatureKey, PlanKey } from '@booking/types';
import { silentLogger } from '../booking/harness.ts';
import { NOW, seed, type Seed } from '../booking/fixtures.ts';
import { PLAN_FEATURES } from '@booking/testing/entitlements.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer, type BookingContainer } from '../helpers.ts';

export const CONNECTOR_TOKEN = 'nerova-test-token-0123456789';
export const ENDPOINT = '/connector/nerova/mcp';

/** Entitlements over a business → plan map, honouring the real contract (unknown business → NOT_FOUND). */
export function plansEntitlements(plans: Map<string, PlanKey>): EntitlementService {
  const featuresOf = (businessId: string): FeatureKey[] => {
    const plan = plans.get(businessId);
    if (!plan) throw notFound('Business plan');
    return PLAN_FEATURES[plan];
  };
  return {
    async getEntitlements(businessId) {
      return { plan: plans.get(businessId) ?? 'free', features: featuresOf(businessId).map((feature) => ({ feature, monthly_limit: null })) };
    },
    async hasFeature(businessId, feature) {
      return featuresOf(businessId).includes(feature);
    },
    async listBusinessIdsWithFeature(feature, { after, limit }) {
      return [...plans.entries()]
        .filter(([id, plan]) => PLAN_FEATURES[plan].includes(feature) && (!after || id > after))
        .map(([id]) => id)
        .sort()
        .slice(0, limit);
    },
  };
}

export interface ToolResult {
  isError?: boolean;
  structuredContent: any;
  content: { type: string; text: string }[];
}

export interface NerovaHarness extends Seed {
  app: ReturnType<typeof createApp>;
  plans: Map<string, PlanKey>;
  /** A second business on the Free plan, with one service */
  freeBusinessId: string;
  changes: AppointmentChangedEvent[];
  accountEvents: { businessId: string; type: string }[];
  rpc(method: string, params?: unknown, opts?: { token?: string | null; id?: number | null; headers?: Record<string, string> }): Promise<{ status: number; body: any }>;
  tool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  /** Calls a tool and unwraps structuredContent, failing the test on isError */
  ok(name: string, args: Record<string, unknown>): Promise<any>;
}

export function nerovaHarness(opts: { env?: Partial<Env>; wrapBooking?: (booking: BookingService) => BookingService } = {}): NerovaHarness {
  const s = seed();
  const free = { ...s.business, id: s.repo.nextId(), clerk_org_id: 'org_free', slug: 'free-salon', name: 'Free Salon' };
  s.repo.tables.businesses.push(free);
  const plans = new Map<string, PlanKey>([
    [s.business.id, 'starter'],
    [free.id, 'free'],
  ]);

  const changes: AppointmentChangedEvent[] = [];
  const accountEvents: { businessId: string; type: string }[] = [];
  const realBooking = createBookingServiceFromRepository({
    repository: s.repo,
    notifications: { appointmentChanged: async (e) => void changes.push(e) },
    logger: silentLogger,
    clock: () => NOW,
  });
  const booking = opts.wrapBooking ? opts.wrapBooking(realBooking) : realBooking;
  const nerovaEvents: AccountEventsPort = { accountChanged: async (businessId, type) => void accountEvents.push({ businessId, type }) };
  const container: BookingContainer = {
    ...testContainer({
      booking,
      entitlements: plansEntitlements(plans),
      nerovaEvents,
      clock: () => NOW,
      env: { ...TEST_ENV, NEROVA_CONNECTOR_TOKEN_HASHES: sha256Hex(CONNECTOR_TOKEN), ...opts.env },
    }),
    bookingRepository: s.repo,
  };
  const app = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });

  let seq = 0;
  async function rpc(method: string, params?: unknown, o: { token?: string | null; id?: number | null; headers?: Record<string, string> } = {}) {
    seq += 1;
    const token = o.token === undefined ? CONNECTOR_TOKEN : o.token;
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(o.headers ?? {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    const message = { jsonrpc: '2.0', ...(o.id === null ? {} : { id: o.id ?? seq }), method, ...(params === undefined ? {} : { params }) };
    const res = await app.request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(message) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  async function tool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { body } = await rpc('tools/call', { name, arguments: args });
    return body.result as ToolResult;
  }
  async function ok(name: string, args: Record<string, unknown>) {
    const result = await tool(name, args);
    if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent)}`);
    return result.structuredContent;
  }

  return { ...s, app, plans, freeBusinessId: free.id, changes, accountEvents, rpc, tool, ok };
}
