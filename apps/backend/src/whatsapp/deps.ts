/**
 * Dependency bundle for everything under whatsapp/ and notifications/.
 * Built lazily from the scaffold Container (db → Supabase repo, global fetch
 * → Graph client). Tests attach overrides as `container.whatsapp`.
 */
import { randomUUID } from 'node:crypto';

import type { Container } from '../container.ts';
import type { Env } from '../env.ts';
import { decryptSecret } from '../lib/crypto.ts';
import type { Db } from '../lib/db.ts';
import { createLogger, type Logger } from '../lib/logger.ts';
import { createPushSender, type PushSender } from '../notifications/push.ts';
import type { BookingService } from '../ports.ts';
import { createGraphClient, type GraphClient } from './graph.ts';
import type { WaAccountRow, WaRepo } from './repo.ts';
import { supabaseWaRepo } from './supabaseRepo.ts';

/** What sending a message needs (notifications have no BookingService). */
export interface OutboundDeps {
  env: Env;
  repo: WaRepo;
  /** Graph client bound to an access token */
  graph: (accessToken: string) => GraphClient;
  push: PushSender;
  now: () => Date;
  logger: Logger;
}

export interface WaDeps extends OutboundDeps {
  booking: BookingService;
  newId: () => string;
}

/** A Container that may carry WhatsApp overrides (tests). */
export type WaContainer = Container & { whatsapp?: Partial<WaDeps> };

export function buildOutboundDeps(input: { env: Env; db?: Db; overrides?: Partial<OutboundDeps> }): OutboundDeps {
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
  };
}

const cache = new WeakMap<Container, WaDeps>();

export function getWaDeps(container: Container, logger?: Logger): WaDeps {
  let deps = cache.get(container);
  if (!deps) {
    const overrides = (container as WaContainer).whatsapp ?? {};
    const base = buildOutboundDeps({ env: container.env, db: overrides.repo ? undefined : container.db, overrides });
    deps = { ...base, booking: overrides.booking ?? container.booking, newId: overrides.newId ?? randomUUID };
    cache.set(container, deps);
  }
  return logger ? { ...deps, logger } : deps;
}

function missingRepo(): WaRepo {
  return new Proxy({} as WaRepo, {
    get: (_t, prop) => () => Promise.reject(new Error(`WhatsApp repository not configured (${String(prop)})`)),
  });
}

export function accountToken(env: Env, account: Pick<WaAccountRow, 'access_token_ciphertext'>): string | null {
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
