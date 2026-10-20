/**
 * Channel onboarding and lifecycle for one business's WhatsApp number.
 *
 * Connect (Embedded Signup or a system-user token) stores the encrypted
 * token, then runs the setup steps. Every step is idempotent, so `sync`
 * simply runs them again: subscribe the app → fetch phone info → register
 * the number (only if not connected) → upload the Flows public key →
 * create/publish the Flows → create the utility templates → go live.
 *
 * subscribe / phone / register are required; a failure stops setup, records
 * `last_error` and returns UPSTREAM_META_ERROR. Flows and templates are
 * optional (the list path and session messages work without them): their
 * failures are recorded in `last_error` and the number still goes live.
 */
import type { WhatsAppChannelDTO, WhatsAppTemplateDTO } from '@booking/types';
import { encryptSecret } from '@booking/features/lib/crypto.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { normalizePhone } from '@booking/features/lib/phone.ts';
import { regionForBusiness } from '@booking/features/lib/region.ts';
import { FLOW_DEFINITIONS, TEMPLATE_DEFINITIONS, type FlowKind } from './assets.ts';
import { accountGraph, type OutboundDeps } from './deps.ts';
import { flowPublicKeyPem, loadFlowPrivateKey } from './flows/crypto.ts';
import { GraphError, isGraphError, type GraphClient, type TemplateSummary } from './graph.ts';
import type { FlowIds, TemplateStatusValue, WaAccountRow } from './repo.ts';

export type OnboardingDeps = Pick<OutboundDeps, 'env' | 'repo' | 'graph' | 'now' | 'logger'>;

export type SetupStep = 'subscribe' | 'phone' | 'register' | 'flow_key' | 'flows' | 'templates';

// ---------------------------------------------------------------- status

export async function getChannelStatus(deps: OnboardingDeps, businessId: string): Promise<WhatsAppChannelDTO> {
  const account = await deps.repo.getAccountByBusiness(businessId);
  if (!account) {
    return {
      connected: false,
      status: null,
      display_phone: null,
      verified_name: null,
      quality_rating: null,
      messaging_limit: null,
      token_expires_at: null,
      last_health_check_at: null,
      last_error: null,
      flows: { booking: null, reschedule: null },
      templates: [],
    };
  }
  const templates = await deps.repo.listTemplates(account.id);
  return {
    connected: account.status !== 'disconnected' && !!account.access_token_ciphertext,
    status: account.status,
    display_phone: account.display_phone,
    verified_name: account.verified_name,
    quality_rating: account.quality_rating,
    messaging_limit: account.messaging_limit,
    token_expires_at: account.token_expires_at,
    last_health_check_at: account.last_health_check_at,
    last_error: account.last_error,
    flows: { booking: account.flow_ids.booking ?? null, reschedule: account.flow_ids.reschedule ?? null },
    templates: templates.map(
      (t): WhatsAppTemplateDTO => ({
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        rejection_reason: t.rejection_reason,
      }),
    ),
  };
}

// ---------------------------------------------------------------- connect

export interface ConnectInput {
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
}

/**
 * The Flows endpoint Meta calls: `${API_BASE_URL}/flows/whatsapp`. Never
 * derived from a request origin (the API runs behind Supabase's
 * /functions/v1/api prefix).
 */
export function flowEndpointUri(env: OnboardingDeps['env']): string | null {
  const base = env.API_BASE_URL;
  return base ? `${base.replace(/\/+$/, '')}/flows/whatsapp` : null;
}

/** Manual connect with an existing (system-user) access token. */
export async function connectWithToken(deps: OnboardingDeps, input: ConnectInput & { accessToken: string }): Promise<WhatsAppChannelDTO> {
  const { META_APP_ID: appId, META_APP_SECRET: appSecret } = deps.env;
  let expiresAt: string | null = null;
  if (appId && appSecret) {
    const info = await metaCall('token', () => deps.graph(input.accessToken).debugToken({ appId, appSecret, inputToken: input.accessToken }));
    if (!info.isValid) throw new AppError('VALIDATION_FAILED', 'The access token is not valid', { field: 'access_token' });
    expiresAt = info.expiresAt?.toISOString() ?? null;
  }
  return connect(deps, input, input.accessToken, expiresAt);
}

/** Embedded Signup: exchange the code for a business token, then connect. */
export async function completeEmbeddedSignup(deps: OnboardingDeps, input: ConnectInput & { code: string }): Promise<WhatsAppChannelDTO> {
  const { META_APP_ID: appId, META_APP_SECRET: appSecret } = deps.env;
  if (!appId || !appSecret) throw new AppError('INTERNAL', 'META_APP_ID and META_APP_SECRET must be configured for Embedded Signup');
  const exchanged = await metaCall('code_exchange', () => deps.graph('').exchangeCode({ appId, appSecret, code: input.code }));
  const info = await metaCall('token', () =>
    deps.graph(exchanged.accessToken).debugToken({ appId, appSecret, inputToken: exchanged.accessToken }),
  );
  const expiresAt =
    info.expiresAt?.toISOString() ?? (exchanged.expiresIn ? new Date(deps.now().getTime() + exchanged.expiresIn * 1000).toISOString() : null);
  return connect(deps, input, exchanged.accessToken, expiresAt);
}

async function connect(deps: OnboardingDeps, input: ConnectInput, accessToken: string, expiresAt: string | null): Promise<WhatsAppChannelDTO> {
  const key = deps.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new AppError('INTERNAL', 'TOKEN_ENCRYPTION_KEY must be configured');
  const existing = await deps.repo.getAccountByBusiness(input.businessId);
  const other = await deps.repo.getAccountByPhoneNumberId(input.phoneNumberId);
  if (other && other.business_id !== input.businessId) {
    throw new AppError('VALIDATION_FAILED', 'This WhatsApp number is connected to another business', { field: 'phone_number_id' });
  }
  const sameWaba = existing?.waba_id === input.wabaId;
  const samePhone = sameWaba && existing?.phone_number_id === input.phoneNumberId;
  const account = await deps.repo.upsertAccount(input.businessId, {
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    access_token_ciphertext: encryptSecret(accessToken, key),
    token_expires_at: expiresAt,
    // Flows belong to the WABA; everything else is re-read during setup.
    flow_ids: sameWaba ? existing.flow_ids : {},
    status: samePhone && existing.status === 'paused' ? 'paused' : 'pending',
    last_error: null,
  });
  if (!sameWaba && existing) {
    deps.logger.info('wa_account_replaced', { business_id: input.businessId });
  }
  await runSetup(deps, account);
  return getChannelStatus(deps, input.businessId);
}

// ---------------------------------------------------------------- sync / lifecycle

export async function syncAccount(deps: OnboardingDeps, businessId: string): Promise<WhatsAppChannelDTO> {
  const account = await requireAccount(deps, businessId);
  if (account.status === 'disconnected' || !account.access_token_ciphertext) {
    throw new AppError('RULE_VIOLATION', 'WhatsApp is disconnected. Connect it again first.', { rule: 'CHANNEL_DISCONNECTED' });
  }
  await runSetup(deps, account);
  return getChannelStatus(deps, businessId);
}

export async function pauseAccount(deps: OnboardingDeps, businessId: string): Promise<WhatsAppChannelDTO> {
  const account = await requireAccount(deps, businessId);
  if (account.status === 'disconnected') {
    throw new AppError('RULE_VIOLATION', 'WhatsApp is disconnected', { rule: 'CHANNEL_DISCONNECTED' });
  }
  if (account.status !== 'paused') await deps.repo.updateAccount(account.id, { status: 'paused' });
  return getChannelStatus(deps, businessId);
}

/** Back to live after a pause; a number that never finished setup must be synced instead. */
export async function resumeAccount(deps: OnboardingDeps, businessId: string): Promise<WhatsAppChannelDTO> {
  const account = await requireAccount(deps, businessId);
  if (account.status === 'paused') {
    if (!account.display_phone || !accountGraph(deps, account)) {
      throw new AppError('RULE_VIOLATION', 'Finish setting up WhatsApp (sync) before resuming', { rule: 'CHANNEL_NOT_READY' });
    }
    await deps.repo.updateAccount(account.id, { status: 'live' });
  } else if (account.status !== 'live') {
    throw new AppError('RULE_VIOLATION', `WhatsApp cannot be resumed from ${account.status}`, { rule: 'CHANNEL_NOT_PAUSED' });
  }
  return getChannelStatus(deps, businessId);
}

/** Unsubscribes the app (best effort) and forgets the token. Idempotent. */
export async function disconnectAccount(deps: OnboardingDeps, businessId: string): Promise<WhatsAppChannelDTO> {
  const account = await requireAccount(deps, businessId);
  const graph = accountGraph(deps, account);
  if (graph) {
    await graph.unsubscribeApp(account.waba_id).catch((err) =>
      deps.logger.warn('wa_unsubscribe_failed', { business_id: businessId, error: isGraphError(err) ? err.summary() : 'error' }),
    );
  }
  await deps.repo.updateAccount(account.id, { status: 'disconnected', access_token_ciphertext: null, token_expires_at: null, last_error: null });
  return getChannelStatus(deps, businessId);
}

/** Sends Meta's pre-approved `hello_world` template (not stored: the recipient may not be a client). */
export async function sendTestMessage(deps: OnboardingDeps, businessId: string, to: string): Promise<{ wa_message_id: string }> {
  const account = await requireAccount(deps, businessId);
  const graph = accountGraph(deps, account);
  if (!graph || account.status === 'disconnected') {
    throw new AppError('RULE_VIOLATION', 'WhatsApp is not connected', { rule: 'CHANNEL_DISCONNECTED' });
  }
  const brief = await deps.repo.getBusinessBrief(businessId);
  const phone = normalizePhone(to, brief ? regionForBusiness(brief) : null);
  const { wamid } = await metaCall('test_message', () =>
    graph.sendMessage(account.phone_number_id, {
      to: phone.slice(1),
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    }),
  );
  return { wa_message_id: wamid };
}

async function requireAccount(deps: OnboardingDeps, businessId: string): Promise<WaAccountRow> {
  const account = await deps.repo.getAccountByBusiness(businessId);
  if (!account) throw new AppError('NOT_FOUND', 'WhatsApp is not connected');
  return account;
}

// ---------------------------------------------------------------- setup steps

export async function runSetup(deps: OnboardingDeps, account: WaAccountRow): Promise<void> {
  const graph = accountGraph(deps, account);
  if (!graph) throw new AppError('INTERNAL', 'Stored WhatsApp token could not be read');
  const warnings: string[] = [];
  const required = async <T>(step: SetupStep, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      const e = asGraphError(err);
      await deps.repo.updateAccount(account.id, {
        last_error: `${step}: ${e.summary()}`,
        ...(e.kind === 'token_invalid' ? { status: 'needs_reauth' as const } : {}),
      });
      deps.logger.warn('wa_setup_failed', { business_id: account.business_id, step, kind: e.kind, code: e.code ?? null });
      throw new AppError('UPSTREAM_META_ERROR', `WhatsApp setup failed at step "${step}"`, { step, kind: e.kind, meta_code: e.code ?? null });
    }
  };
  const optional = async (step: SetupStep, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const e = asGraphError(err);
      warnings.push(`${step}: ${e.summary()}`);
      deps.logger.warn('wa_setup_step_skipped', { business_id: account.business_id, step, kind: e.kind, code: e.code ?? null });
    }
  };

  await required('subscribe', () => graph.subscribeApp(account.waba_id));
  let info = await required('phone', () => graph.getPhoneNumber(account.phone_number_id));
  if (info.status !== undefined && info.status !== 'CONNECTED') {
    const pin = deps.env.WHATSAPP_REGISTRATION_PIN;
    await required('register', async () => {
      if (!pin) throw new GraphError({ message: 'WHATSAPP_REGISTRATION_PIN is not set', status: 0, kind: 'bad_params' });
      await graph.registerNumber(account.phone_number_id, pin);
    });
    info = await required('phone', () => graph.getPhoneNumber(account.phone_number_id));
  }

  let flowIds: FlowIds = { ...account.flow_ids };
  let keyUploaded = false;
  const endpointUri = flowEndpointUri(deps.env);
  await optional('flow_key', async () => {
    const pem = deps.env.WHATSAPP_FLOW_PRIVATE_KEY;
    if (!pem || !deps.env.FLOW_TOKEN_SECRET || !endpointUri) {
      throw new GraphError({
        message: 'Flows disabled: WHATSAPP_FLOW_PRIVATE_KEY / FLOW_TOKEN_SECRET / API_BASE_URL not set',
        status: 0,
        kind: 'bad_params',
      });
    }
    const publicKey = flowPublicKeyPem(loadFlowPrivateKey(pem, deps.env.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE));
    await graph.uploadFlowPublicKey(account.phone_number_id, publicKey);
    keyUploaded = true;
  });
  if (keyUploaded && endpointUri) {
    await optional('flows', async () => {
      const result = await ensureFlows(graph, account.waba_id, flowIds, endpointUri);
      flowIds = result.ids;
      if (result.problems.length) throw new GraphError({ message: result.problems.join(', '), status: 0, kind: 'bad_params' });
    });
  }
  await optional('templates', () => ensureTemplates(deps, account, graph));

  await deps.repo.updateAccount(account.id, {
    display_phone: info.display_phone_number ?? account.display_phone,
    verified_name: info.verified_name ?? account.verified_name,
    quality_rating: info.quality_rating ?? account.quality_rating,
    messaging_limit: info.messaging_limit_tier ?? account.messaging_limit,
    flow_ids: flowIds,
    status: account.status === 'paused' ? 'paused' : 'live',
    last_health_check_at: deps.now().toISOString(),
    last_error: warnings.length ? warnings.join('; ').slice(0, 500) : null,
  });
}

/** Finds each Flow by id or name, creating/publishing as needed. `ids` holds only published Flows. */
export async function ensureFlows(
  graph: GraphClient,
  wabaId: string,
  current: FlowIds,
  endpointUri: string,
): Promise<{ ids: FlowIds; problems: string[] }> {
  const existing = await graph.listFlows(wabaId);
  const ids: FlowIds = {};
  const problems: string[] = [];
  for (const kind of Object.keys(FLOW_DEFINITIONS) as FlowKind[]) {
    const def = FLOW_DEFINITIONS[kind];
    const flowJson = JSON.stringify(def.json);
    const found =
      existing.find((f) => f.id === current[kind] && f.name === def.name && f.status !== 'DEPRECATED') ??
      existing.find((f) => f.name === def.name && f.status !== 'DEPRECATED');
    if (!found) {
      const created = await graph.createFlow(wabaId, { name: def.name, categories: [...def.categories], flowJson, endpointUri, publish: true });
      if (created.validationErrors.length) problems.push(`${kind} flow has ${created.validationErrors.length} validation error(s)`);
      else ids[kind] = created.id;
    } else if (found.status === 'DRAFT') {
      const updated = await graph.updateFlowJson(found.id, flowJson);
      if (updated.validationErrors.length) {
        problems.push(`${kind} flow has ${updated.validationErrors.length} validation error(s)`);
        continue;
      }
      await graph.updateFlowMetadata(found.id, { endpointUri });
      await graph.publishFlow(found.id);
      ids[kind] = found.id;
    } else if (found.status === 'PUBLISHED') {
      ids[kind] = found.id;
    } else {
      problems.push(`${kind} flow is ${found.status}`);
    }
  }
  return { ids, problems };
}

const TEMPLATE_STATUS: Record<string, TemplateStatusValue> = {
  APPROVED: 'approved',
  PENDING: 'submitted',
  IN_APPEAL: 'submitted',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  DISABLED: 'disabled',
};

export const mapTemplateStatus = (status: string | undefined): TemplateStatusValue => TEMPLATE_STATUS[status ?? ''] ?? 'draft';

const rejection = (t: Pick<TemplateSummary, 'status' | 'rejected_reason'>) =>
  t.status === 'REJECTED' && t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null;

async function ensureTemplates(deps: OnboardingDeps, account: WaAccountRow, graph: GraphClient): Promise<void> {
  const remote = await graph.listTemplates(account.waba_id);
  for (const def of TEMPLATE_DEFINITIONS) {
    let found = remote.find((t) => t.name === def.name && t.language === def.language);
    if (!found) {
      const created = await graph.createTemplate(account.waba_id, {
        name: def.name,
        language: def.language,
        category: def.category,
        components: def.components,
      });
      found = { id: created.id, name: def.name, language: def.language, status: created.status };
    }
    await deps.repo.upsertTemplate({
      business_id: account.business_id,
      whatsapp_account_id: account.id,
      name: def.name,
      language: def.language,
      category: def.category.toLowerCase(),
      meta_template_id: found.id,
      status: mapTemplateStatus(found.status),
      rejection_reason: rejection(found),
      components: def.components,
    });
  }
}

/** Refreshes stored template statuses from Meta (health job). */
export async function syncTemplateStatuses(deps: Pick<OnboardingDeps, 'repo'>, account: WaAccountRow, graph: GraphClient): Promise<number> {
  const local = await deps.repo.listTemplates(account.id);
  if (!local.length) return 0;
  const remote = await graph.listTemplates(account.waba_id);
  let changed = 0;
  for (const t of local) {
    const r = remote.find((x) => x.name === t.name && x.language === t.language);
    if (!r) continue;
    const status = mapTemplateStatus(r.status);
    if (status === t.status && r.id === t.meta_template_id) continue;
    changed += await deps.repo.updateTemplateStatus(
      account.id,
      { name: t.name, language: t.language },
      { status, rejection_reason: rejection(r), meta_template_id: r.id },
    );
  }
  return changed;
}

// ---------------------------------------------------------------- helpers

function asGraphError(err: unknown): GraphError {
  if (isGraphError(err)) return err;
  return new GraphError({ message: err instanceof Error ? err.message : 'unexpected error', status: 0, kind: 'other' });
}

async function metaCall<T>(step: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = asGraphError(err);
    if (e.kind === 'token_invalid') throw new AppError('VALIDATION_FAILED', 'The access token is not valid', { field: 'access_token' });
    throw new AppError('UPSTREAM_META_ERROR', `Meta rejected the ${step.replace('_', ' ')} request`, { step, kind: e.kind, meta_code: e.code ?? null });
  }
}
