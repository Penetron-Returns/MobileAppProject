/**
 * Dependency bundle for everything under whatsapp/ and notifications/.
 * Built lazily from the API container (db → Supabase repo, global fetch
 * → Graph client). The container is typed structurally (WaContainer) so this
 * package never imports apps/api. Tests attach overrides as `container.whatsapp`.
 */
import { randomUUID } from 'node:crypto';

import { decryptSecret } from '@booking/features/lib/crypto.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { createLogger, type Logger } from '@booking/features/lib/logger.ts';
import { createPushSender, type PushSender } from './notifications/push.ts';
import type { BookingService, EntitlementService } from '@booking/features/ports.ts';
import type { NerovaClientChannel } from './notifications/nerovaChannel.ts';
import { createGraphClient, type GraphClient } from './graph.ts';
import type { WaAccountRow, WaRepo } from './repo.ts';
import { supabaseWaRepo } from './supabaseRepo.ts';

/** The slice of the API environment the WhatsApp app reads. apps/api's Env is assignable to it. */
export interface WhatsAppEnv {
  readonly META_GRAPH_VERSION: string;
  readonly META_APP_ID?: string | undefined;
  readonly META_APP_SECRET?: string | undefined;
  readonly EXPO_ACCESS_TOKEN?: string | undefined;
  readonly FLOW_TOKEN_SECRET?: string | undefined;
  readonly TOKEN_ENCRYPTION_KEY?: string | undefined;
  readonly API_BASE_URL?: string | undefined;
  readonly WHATSAPP_REGISTRATION_PIN?: string | undefined;
  readonly WHATSAPP_FLOW_PRIVATE_KEY?: string | undefined;
  readonly WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE?: string | undefined;
}

/** What sending a message needs (notifications have no BookingService). */
export interface OutboundDeps {
  env: WhatsAppEnv;
  repo: WaRepo;
  /** Graph client bound to an access token */
  graph: (accessToken: string) => GraphClient;
  push: PushSender;
  now: () => Date;
  logger: Logger;
  /** Client-message channel for businesses whose WhatsApp number is on Nerova; absent = every business uses our Meta path */
  nerovaChannel?: NerovaClientChannel | undefined;
}

export interface WaDeps extends OutboundDeps {
  booking: BookingService;
  /** Plan gating: the engine only runs for businesses with the whatsapp_menu feature */
  entitlements: EntitlementService;
  newId: () => string;
}

/** What the WhatsApp app needs from the API container; it may carry overrides (tests). */
export interface WaContainer {
  env: WhatsAppEnv;
  db: Db;
  booking: BookingService;
  entitlements: EntitlementService;
  nerovaChannel?: NerovaClientChannel | undefined;
  whatsapp?: Partial<WaDeps>;
}

export function buildOutboundDeps(input: {
  env: WhatsAppEnv;
  db?: Db;
  overrides?: Partial<OutboundDeps>;
}): OutboundDeps {
  const o = input.overrides ?? {};
  const logger = o.logger ?? createLogger({ module: 'whatsapp' });
  const repo = o.repo ?? (input.db ? supabaseWaRepo(input.db) : missingRepo());
  return {
    env: input.env,
    repo,
    graph: o.graph ?? ((accessToken) => createGraphClient({ version: input.env.META_GRAPH_VERSION, accessToken })),
    push:
      o.push ??
      createPushSender({ listTokens: (id) => repo.listPushTokens(id), accessToken: input.env.EXPO_ACCESS_TOKEN, logger }),
    now: o.now ?? (() => new Date()),
    logger,
    nerovaChannel: o.nerovaChannel,
  };
}

const cache = new WeakMap<WaContainer, WaDeps>();

export function getWaDeps(container: WaContainer, logger?: Logger): WaDeps {
  let deps = cache.get(container);
  if (!deps) {
    const overrides = container.whatsapp ?? {};
    const base = buildOutboundDeps({
      env: container.env,
      db: overrides.repo ? undefined : container.db,
      overrides: { ...overrides, nerovaChannel: overrides.nerovaChannel ?? container.nerovaChannel },
    });
    deps = {
      ...base,
      booking: overrides.booking ?? container.booking,
      entitlements: overrides.entitlements ?? container.entitlements,
      newId: overrides.newId ?? randomUUID,
    };
    cache.set(container, deps);
  }
  return logger ? { ...deps, logger } : deps;
}

function missingRepo(): WaRepo {
  return new Proxy({} as WaRepo, {
    get: (_t, prop) => () => Promise.reject(new Error(`WhatsApp repository not configured (${String(prop)})`)),
  });
}

export function accountToken(env: WhatsAppEnv, account: Pick<WaAccountRow, 'access_token_ciphertext'>): string | null {
  if (!account.access_token_ciphertext || !env.TOKEN_ENCRYPTION_KEY) return null;
  try {
    return decryptSecret(account.access_token_ciphertext, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

export function accountGraph(deps: Pick<OutboundDeps, 'env' | 'graph'>, account: WaAccountRow): GraphClient | null {
  const token = accountToken(deps.env, account);
  return token ? deps.graph(token) : null;
}
