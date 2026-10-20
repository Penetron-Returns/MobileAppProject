/** Deps builder for WhatsApp tests: fake repository, Graph client and clock. */

import { encryptSecret } from '@booking/features/lib/crypto.ts';
import type { BookingService } from '@booking/features/ports.ts';
import type { Logger } from '@booking/features/lib/logger.ts';
import type { WaDeps, WhatsAppEnv } from '@booking/app-store/whatsapp/deps.ts';
import type { WaAccountRow } from '@booking/app-store/whatsapp/repo.ts';
import { fakeGraph, type FakeGraph } from './fakeGraph.ts';
import { memoryRepo } from './memoryRepo.ts';
import { ACCOUNT_ID, BIZ, fakeBooking, makeWorld, NOW, PHONE_NUMBER_ID, uuidN, WABA_ID, type World } from './world.ts';

// ---------------------------------------------------------------- deps

/** Same values as apps/api's TEST_ENV, limited to what the WhatsApp app reads. */
export const TEST_WA_ENV: WhatsAppEnv = {
  META_GRAPH_VERSION: 'v23.0',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  FLOW_TOKEN_SECRET: 'flow-secret',
  META_APP_SECRET: 'app-secret',
};

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

export function liveAccount(over: Partial<WaAccountRow> = {}): WaAccountRow {
  return {
    id: ACCOUNT_ID,
    business_id: BIZ,
    waba_id: WABA_ID,
    phone_number_id: PHONE_NUMBER_ID,
    display_phone: '+27 82 000 0000',
    verified_name: 'Nadia Hair',
    access_token_ciphertext: encryptSecret('EAAG-test-token', TEST_WA_ENV.TOKEN_ENCRYPTION_KEY!),
    token_expires_at: null,
    flow_ids: {},
    status: 'live',
    quality_rating: 'GREEN',
    messaging_limit: 'TIER_1K',
    last_health_check_at: null,
    last_error: null,
    ...over,
  };
}

export interface Harness {
  world: World;
  repo: ReturnType<typeof memoryRepo>;
  graph: FakeGraph;
  booking: BookingService;
  deps: WaDeps;
  pushes: { businessId: string; title: string; body: string }[];
  clock: { now: Date };
}

export function harness(opts: { world?: World; account?: Partial<WaAccountRow> | null } = {}): Harness {
  const world = opts.world ?? makeWorld();
  const repo = memoryRepo(world);
  if (opts.account !== null) repo.db.accounts.push(liveAccount(opts.account ?? {}));
  const graph = fakeGraph();
  const booking = fakeBooking(world);
  const pushes: Harness['pushes'] = [];
  const clock = { now: new Date(NOW) };
  let idSeq = 0;
  const deps: WaDeps = {
    env: { ...TEST_WA_ENV, META_APP_ID: 'app-id', WHATSAPP_REGISTRATION_PIN: '123456' },
    repo,
    booking,
    graph: graph.factory,
    push: {
      async toBusiness(businessId, m) {
        pushes.push({ businessId, title: m.title, body: m.body });
        return 1;
      },
      async toUsers() {
        return 0;
      },
    },
    now: () => new Date(clock.now),
    newId: () => uuidN(++idSeq, 'f'),
    logger: silentLogger,
  };
  return { world, repo, graph, booking, deps, pushes, clock };
}

