/**
 * Nerova pending approvals (read only), used to turn a thin `approval.requested` webhook into a push.
 * A separate small port from NerovaClient on purpose (interface segregation): the webhook needs one read.
 * Throws AppError UPSTREAM_COMPANION_ERROR on any failure; never puts the API key in a message.
 */
import { AppError } from '@booking/features/lib/errors.ts';
import { NEROVA_API_BASE_URL, type NerovaEnv } from './httpClient.ts';

export interface PendingApproval {
  /** `oapr_...` */
  id: string;
  kind: string;
  /** One line, e.g. "Move Gel overlay to Fri 10 Oct, 10:00?" */
  title: string;
  expiresAt: string | null;
}

export interface NerovaApprovalsClient {
  /** The pending approval with this id, or null when it is decided, expired or unknown. */
  findPendingApproval(accountId: string, approvalId: string): Promise<PendingApproval | null>;
}

export interface HttpApprovalsClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const MAX_PAGES = 5;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const upstream = (reason: string, status?: number) =>
  new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service could not list approvals', { reason, ...(status ? { status } : {}) });

export function createHttpApprovalsClient(options: HttpApprovalsClientOptions): NerovaApprovalsClient {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? NEROVA_API_BASE_URL).replace(/\/+$/, '');

  async function page(accountId: string, cursor: string | null): Promise<{ items: unknown[]; next: string | null }> {
    const query = `status=pending${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    let response: Response;
    try {
      response = await doFetch(`${base}/v1/accounts/${encodeURIComponent(accountId)}/approvals?${query}`, {
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
    } catch {
      throw upstream('network');
    }
    if (!response.ok) throw upstream('http_error', response.status);
    const body = (await response.json().catch(() => null)) as { data?: unknown; hasMore?: unknown; nextCursor?: unknown } | null;
    if (!body || !Array.isArray(body.data)) throw upstream('unexpected_response');
    return { items: body.data, next: body.hasMore === true ? str(body.nextCursor) : null };
  }

  return {
    async findPendingApproval(accountId, approvalId) {
      let cursor: string | null = null;
      for (let i = 0; i < MAX_PAGES; i += 1) {
        const { items, next } = await page(accountId, cursor);
        for (const item of items) {
          const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
          if (row.id !== approvalId) continue;
          return { id: approvalId, kind: str(row.kind) ?? '', title: str(row.title) ?? '', expiresAt: str(row.expiresAt) };
        }
        if (!next) return null;
        cursor = next;
      }
      return null;
    },
  };
}

/** Null when NEROVA_API_KEY is unset: the caller then cannot read approvals and skips the push. */
export function createApprovalsClientFromEnv(env: NerovaEnv, options: Omit<HttpApprovalsClientOptions, 'apiKey'> = {}): NerovaApprovalsClient | null {
  return env.NEROVA_API_KEY ? createHttpApprovalsClient({ ...options, apiKey: env.NEROVA_API_KEY }) : null;
}
