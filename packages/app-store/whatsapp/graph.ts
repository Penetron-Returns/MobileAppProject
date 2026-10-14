/**
 * Minimal Meta Graph API client for the WhatsApp Cloud API.
 *
 * - Version comes from META_GRAPH_VERSION.
 * - `fetch`, `sleep` and `random` are injectable so tests are deterministic.
 * - Retries 429 / 5xx / Meta throttling codes with exponential backoff and
 *   jitter; never retries other 4xx.
 * - Errors are mapped to a small set of kinds the rest of the code acts on.
 *
 * Never log request bodies or tokens from here: callers log the error kind.
 */

export type GraphErrorKind =
  | 'token_invalid'
  | 'outside_window'
  | 'undeliverable'
  | 'bad_params'
  | 'throttled'
  | 'network'
  | 'other';

const THROTTLE_CODES = new Set([4, 80007, 130429, 131056]);

export function classifyMetaError(code: number | undefined, status: number): GraphErrorKind {
  if (code === 190) return 'token_invalid';
  if (code === 131047) return 'outside_window';
  if (code === 131026 || code === 131051) return 'undeliverable';
  if (code === 131009 || code === 100) return 'bad_params';
  if ((code !== undefined && THROTTLE_CODES.has(code)) || status === 429) return 'throttled';
  return 'other';
}

export class GraphError extends Error {
  readonly kind: GraphErrorKind;
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;

  constructor(opts: { message: string; status: number; code?: number; subcode?: number; fbtraceId?: string; kind?: GraphErrorKind }) {
    super(opts.message);
    this.name = 'GraphError';
    this.status = opts.status;
    this.code = opts.code;
    this.subcode = opts.subcode;
    this.fbtraceId = opts.fbtraceId;
    this.kind = opts.kind ?? classifyMetaError(opts.code, opts.status);
  }

  /** Safe summary for logs and `last_error` columns (no PII, no token). */
  summary(): string {
    return `${this.kind}${this.code !== undefined ? ` (${this.code})` : ''}: ${this.message}`.slice(0, 300);
  }
}

export const isGraphError = (e: unknown): e is GraphError => e instanceof GraphError;

export interface GraphClientOptions {
  version: string;
  accessToken: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxRetries?: number;
  baseDelayMs?: number;
  baseUrl?: string;
}

type Query = Record<string, string | number | undefined>;

export interface PhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  status?: string;
  name_status?: string;
  code_verification_status?: string;
}

export interface FlowSummary {
  id: string;
  name: string;
  status: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  rejected_reason?: string;
}

export interface SendResult {
  wamid: string;
}

export interface GraphClient {
  sendMessage(phoneNumberId: string, payload: Record<string, unknown>): Promise<SendResult>;
  markAsRead(phoneNumberId: string, wamid: string): Promise<void>;
  getPhoneNumber(phoneNumberId: string): Promise<PhoneNumberInfo>;
  subscribeApp(wabaId: string): Promise<void>;
  unsubscribeApp(wabaId: string): Promise<void>;
  registerNumber(phoneNumberId: string, pin: string): Promise<void>;
  uploadFlowPublicKey(phoneNumberId: string, publicKeyPem: string): Promise<void>;
  listFlows(wabaId: string): Promise<FlowSummary[]>;
  createFlow(
    wabaId: string,
    input: { name: string; categories: string[]; flowJson: string; endpointUri: string; publish: boolean },
  ): Promise<{ id: string; validationErrors: unknown[] }>;
  updateFlowJson(flowId: string, flowJson: string): Promise<{ validationErrors: unknown[] }>;
  updateFlowMetadata(flowId: string, input: { endpointUri?: string; name?: string }): Promise<void>;
  publishFlow(flowId: string): Promise<void>;
  listTemplates(wabaId: string): Promise<TemplateSummary[]>;
  createTemplate(wabaId: string, template: Record<string, unknown>): Promise<{ id: string; status: string }>;
  exchangeCode(input: { appId: string; appSecret: string; code: string }): Promise<{ accessToken: string; expiresIn?: number }>;
  debugToken(input: { appId: string; appSecret: string; inputToken: string }): Promise<{ isValid: boolean; expiresAt: Date | null; scopes: string[] }>;
  exchangeLongLived(input: { appId: string; appSecret: string; token: string }): Promise<{ accessToken: string; expiresIn?: number }>;
}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createGraphClient(opts: GraphClientOptions): GraphClient {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? sleepReal;
  const random = opts.random ?? Math.random;
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 300;
  const root = `${opts.baseUrl ?? 'https://graph.facebook.com'}/${opts.version}`;

  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    init: { query?: Query; json?: unknown; form?: URLSearchParams | FormData; auth?: boolean } = {},
  ): Promise<T> {
    const url = new URL(`${root}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {};
    if (init.auth !== false) headers.authorization = `Bearer ${opts.accessToken}`;
    let body: string | URLSearchParams | FormData | undefined;
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form;
    }

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, { method, headers, body });
      } catch (err) {
        if (attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new GraphError({ message: (err as Error).message ?? 'network error', status: 0, kind: 'network' });
      }
      const text = await res.text();
      let parsed: unknown = undefined;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = undefined;
      }
      if (res.ok) return (parsed ?? {}) as T;

      const meta = (parsed as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } } | undefined)?.error;
      const error = new GraphError({
        message: meta?.message ?? `HTTP ${res.status}`,
        status: res.status,
        code: meta?.code,
        subcode: meta?.error_subcode,
        fbtraceId: meta?.fbtrace_id,
      });
      const retryable = res.status >= 500 || error.kind === 'throttled';
      if (retryable && attempt < maxRetries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw error;
    }
  }

  function backoff(attempt: number): number {
    const exp = baseDelay * 2 ** attempt;
    return Math.round(exp + random() * exp);
  }

  const appToken = (appId: string, appSecret: string) => `${appId}|${appSecret}`;

  return {
    async sendMessage(phoneNumberId, payload) {
      const res = await request<{ messages?: { id: string }[] }>('POST', `${phoneNumberId}/messages`, {
        json: { messaging_product: 'whatsapp', recipient_type: 'individual', ...payload },
      });
      const wamid = res.messages?.[0]?.id;
      if (!wamid) throw new GraphError({ message: 'Send returned no message id', status: 200, kind: 'other' });
      return { wamid };
    },
    async markAsRead(phoneNumberId, wamid) {
      await request('POST', `${phoneNumberId}/messages`, {
        json: { messaging_product: 'whatsapp', status: 'read', message_id: wamid },
      });
    },
    getPhoneNumber(phoneNumberId) {
      return request<PhoneNumberInfo>('GET', phoneNumberId, {
        query: {
          fields:
            'display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,name_status,code_verification_status',
        },
      });
    },
    async subscribeApp(wabaId) {
      await request('POST', `${wabaId}/subscribed_apps`);
    },
    async unsubscribeApp(wabaId) {
      await request('DELETE', `${wabaId}/subscribed_apps`);
    },
    async registerNumber(phoneNumberId, pin) {
      await request('POST', `${phoneNumberId}/register`, { json: { messaging_product: 'whatsapp', pin } });
    },
    async uploadFlowPublicKey(phoneNumberId, publicKeyPem) {
      const form = new URLSearchParams({ business_public_key: publicKeyPem });
      await request('POST', `${phoneNumberId}/whatsapp_business_encryption`, { form });
    },
    async listFlows(wabaId) {
      const res = await request<{ data?: FlowSummary[] }>('GET', `${wabaId}/flows`, { query: { fields: 'id,name,status', limit: 100 } });
      return res.data ?? [];
    },
    async createFlow(wabaId, input) {
      const res = await request<{ id: string; validation_errors?: unknown[] }>('POST', `${wabaId}/flows`, {
        json: {
          name: input.name,
          categories: input.categories,
          flow_json: input.flowJson,
          endpoint_uri: input.endpointUri,
          publish: input.publish,
        },
      });
      return { id: res.id, validationErrors: res.validation_errors ?? [] };
    },
    async updateFlowJson(flowId, flowJson) {
      const form = new FormData();
      form.set('name', 'flow.json');
      form.set('asset_type', 'FLOW_JSON');
      form.set('file', new Blob([flowJson], { type: 'application/json' }), 'flow.json');
      const res = await request<{ validation_errors?: unknown[] }>('POST', `${flowId}/assets`, { form });
      return { validationErrors: res.validation_errors ?? [] };
    },
    async updateFlowMetadata(flowId, input) {
      await request('POST', flowId, {
        json: { ...(input.endpointUri ? { endpoint_uri: input.endpointUri } : {}), ...(input.name ? { name: input.name } : {}) },
      });
    },
    async publishFlow(flowId) {
      await request('POST', `${flowId}/publish`);
    },
    async listTemplates(wabaId) {
      const res = await request<{ data?: TemplateSummary[] }>('GET', `${wabaId}/message_templates`, {
        query: { fields: 'id,name,language,status,category,rejected_reason', limit: 200 },
      });
      return res.data ?? [];
    },
    async createTemplate(wabaId, template) {
      const res = await request<{ id: string; status: string }>('POST', `${wabaId}/message_templates`, { json: template });
      return { id: res.id, status: res.status };
    },
    async exchangeCode({ appId, appSecret, code }) {
      const res = await request<{ access_token: string; expires_in?: number }>('GET', 'oauth/access_token', {
        auth: false,
        query: { client_id: appId, client_secret: appSecret, code },
      });
      return { accessToken: res.access_token, expiresIn: res.expires_in };
    },
    async debugToken({ appId, appSecret, inputToken }) {
      const res = await request<{ data?: { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[] } }>(
        'GET',
        'debug_token',
        { auth: false, query: { input_token: inputToken, access_token: appToken(appId, appSecret) } },
      );
      const exp = res.data?.expires_at ?? 0;
      return {
        isValid: res.data?.is_valid ?? false,
        expiresAt: exp > 0 ? new Date(exp * 1000) : null,
        scopes: res.data?.scopes ?? [],
      };
    },
    async exchangeLongLived({ appId, appSecret, token }) {
      const res = await request<{ access_token: string; expires_in?: number }>('GET', 'oauth/access_token', {
        auth: false,
        query: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token },
      });
      return { accessToken: res.access_token, expiresIn: res.expires_in };
    },
  };
}
