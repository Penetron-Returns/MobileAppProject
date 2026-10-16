import { describe, expect, it } from 'vitest';

import { createHttpApprovalsClient } from '@booking/companion/nerova/approvals.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createHttpApprovalsClient', () => {
  it('finds the approval across pages with the bearer key and status=pending', async () => {
    const urls: string[] = [];
    let auth = '';
    const client = createHttpApprovalsClient({
      apiKey: 'key_secret',
      fetch: (async (url: string, init: RequestInit) => {
        urls.push(url);
        auth = (init.headers as Record<string, string>).Authorization!;
        return urls.length === 1
          ? json({ data: [{ id: 'oapr_0', title: 'A' }], hasMore: true, nextCursor: 'c1' })
          : json({ data: [{ id: 'oapr_1', kind: 'cancel_appointment', title: 'Cancel it?', expiresAt: '2026-10-16T10:30:00Z' }], hasMore: false, nextCursor: null });
      }) as unknown as typeof fetch,
    });
    expect(await client.findPendingApproval('acct_1', 'oapr_1')).toEqual({ id: 'oapr_1', kind: 'cancel_appointment', title: 'Cancel it?', expiresAt: '2026-10-16T10:30:00Z' });
    expect(urls).toEqual([
      'https://api.nerova.si/v1/accounts/acct_1/approvals?status=pending',
      'https://api.nerova.si/v1/accounts/acct_1/approvals?status=pending&cursor=c1',
    ]);
    expect(auth).toBe('Bearer key_secret');
  });

  it('returns null when the approval is not pending', async () => {
    const client = createHttpApprovalsClient({ apiKey: 'k', fetch: (async () => json({ data: [], hasMore: false })) as unknown as typeof fetch });
    expect(await client.findPendingApproval('acct_1', 'oapr_x')).toBeNull();
  });

  it('throws an upstream error that does not contain the key on a non-2xx', async () => {
    const client = createHttpApprovalsClient({ apiKey: 'key_secret', fetch: (async () => json({ code: 'x' }, 403)) as unknown as typeof fetch });
    const error = await client.findPendingApproval('acct_1', 'oapr_1').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR' });
    expect(JSON.stringify(error) + String((error as Error).message)).not.toContain('key_secret');
  });
});
