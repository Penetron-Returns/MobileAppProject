/**
 * Nerova executed actions (read only), used to turn a thin `action.executed` webhook into a push, exactly like
 * approvals.ts does for `approval.requested`: partner API key, server-side, one read. Throws AppError
 * UPSTREAM_COMPANION_ERROR on any failure and never puts the API key in a message.
 * ASSUMPTION to confirm with Nerova: the partner-scoped read is `GET /v1/accounts/{accountId}/actions/{actionId}`
 * (the companion-session route `/v1/companion/actions/{id}` needs a widget session the webhook does not have).
 */
import { AppError } from '@booking/features/lib/errors.ts';
import { NEROVA_API_BASE_URL, type NerovaEnv } from './httpClient.ts';

export interface ExecutedAction {
  /** `oact_...` */
  id: string;
  kind: string;
  /** One line, e.g. "Book Gel overlay for Thandi on Fri 16 Oct, 20:30" */
  title: string;
}

export interface NerovaActionsClient {
  /** The action, or null when Nerova does not know it (404). */
  getAction(accountId: string, actionId: string): Promise<ExecutedAction | null>;
}

export interface HttpActionsClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const upstream = (reason: string, status?: number) =>
  new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service could not read the action', { reason, ...(status ? { status } : {}) });

export function createHttpActionsClient(options: HttpActionsClientOptions): NerovaActionsClient {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? NEROVA_API_BASE_URL).replace(/\/+$/, '');
  return {
    async getAction(accountId, actionId) {
      let response: Response;
      try {
        response = await doFetch(`${base}/v1/accounts/${encodeURIComponent(accountId)}/actions/${encodeURIComponent(actionId)}`, {
          headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
        });
      } catch {
        throw upstream('network');
      }
      if (response.status === 404) return null;
      if (!response.ok) throw upstream('http_error', response.status);
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const inner = (typeof body?.action === 'object' && body.action !== null ? body.action : body) as Record<string, unknown> | null;
      const id = str(inner?.id);
      if (!id) throw upstream('unexpected_response');
      return { id, kind: str(inner?.kind) ?? '', title: str(inner?.title) ?? '' };
    },
  };
}

/** Null when NEROVA_API_KEY is unset: the title cannot be read and the push falls back to a generic body. */
export const createActionsClientFromEnv = (env: NerovaEnv, options: Omit<HttpActionsClientOptions, 'apiKey'> = {}): NerovaActionsClient | null =>
  env.NEROVA_API_KEY ? createHttpActionsClient({ ...options, apiKey: env.NEROVA_API_KEY }) : null;
