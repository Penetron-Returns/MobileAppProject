import { beforeEach, describe, expect, it } from 'vitest';

import { signStandardWebhook } from '@booking/companion/events/events.ts';
import type { NerovaApprovalsClient, PendingApproval } from '@booking/companion/nerova/approvals.ts';
import type { ApprovalPushDeps } from '@booking/companion/approvals/approvalPush.ts';
import { createMemoryAttendanceRepository } from '@booking/testing/attendanceMemory.ts';
import type { AttendancePushMessage } from '@booking/features/attendance/ports.ts';
import { createApp } from '../../src/app.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer, type BookingContainer } from '../helpers.ts';
import { silentLogger } from '../booking/harness.ts';
import { NOW, seed, type Seed } from '../booking/fixtures.ts';

const SECRET = `whsec_${Buffer.alloc(32, 5).toString('base64')}`;
const ACCOUNT = 'acct_1';
const APPROVAL = 'oapr_1';

class FakeApprovals implements NerovaApprovalsClient {
  pending: PendingApproval[] = [{ id: APPROVAL, kind: 'cancel_appointment', title: 'Cancel Gel overlay on Fri 10 Oct, 10:00?', expiresAt: null }];
  calls: { accountId: string; approvalId: string }[] = [];
  async findPendingApproval(accountId: string, approvalId: string) {
    this.calls.push({ accountId, approvalId });
    return this.pending.find((a) => a.id === approvalId) ?? null;
  }
}

interface Sent {
  businessId: string;
  userIds: string[];
  message: AttendancePushMessage;
}

let s: Seed;
let approvals: FakeApprovals;
let sent: Sent[];
let app: ReturnType<typeof createApp>;
let seq = 0;

beforeEach(() => {
  s = seed();
  approvals = new FakeApprovals();
  s.repo.tables.users.push(
    { id: 'user_owner', business_id: s.business.id, role: 'owner', email: null, display_name: null, avatar_url: null },
    { id: 'user_staff', business_id: s.business.id, role: 'staff', email: null, display_name: null, avatar_url: null },
  );
  sent = [];
  const repo = createMemoryAttendanceRepository(s.repo.tables, () => NOW);
  const approvalPush: ApprovalPushDeps = {
    approvals,
    repo,
    push: {
      async toUsers(businessId, userIds, message) {
        sent.push({ businessId, userIds, message });
        return userIds.length;
      },
    },
    logger: silentLogger,
  };
  const container = { ...testContainer({ clock: () => NOW, env: { ...TEST_ENV, NEROVA_WEBHOOK_SECRET: SECRET } }), bookingRepository: s.repo, approvalPush } as BookingContainer;
  app = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });
});

const envelope = (type: string, object: Record<string, unknown> = {}) => ({
  id: `evt_${seq}`,
  type,
  apiVersion: '2026-07-01',
  createdAt: NOW.toISOString(),
  livemode: true,
  data: { object },
});
const approvalObject = (over: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT,
  externalReference: s.business.id,
  approvalId: APPROVAL,
  kind: 'cancel_appointment',
  expiresAt: '2026-09-28T06:30:00Z',
  ...over,
});

async function deliver(body: unknown, opts: { id?: string; secret?: string; at?: Date } = {}) {
  seq += 1;
  const id = opts.id ?? `evt_${seq}`;
  const raw = JSON.stringify(body);
  const ts = Math.floor((opts.at ?? NOW).getTime() / 1000);
  const res = await app.request('/webhooks/nerova', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(ts),
      'webhook-signature': signStandardWebhook(opts.secret ?? SECRET, id, ts, raw),
    },
    body: raw,
  });
  await new Promise((r) => setTimeout(r, 0)); // the background push settles
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('POST /webhooks/nerova', () => {
  it('answers 503 and does nothing when the secret is not configured', async () => {
    const container = { ...testContainer({ clock: () => NOW }), bookingRepository: s.repo } as BookingContainer;
    const bare = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });
    const res = await bare.request('/webhooks/nerova', { method: 'POST', body: '{}' });
    expect(res.status).toBe(503);
  });

  it('rejects a bad signature with 401 and records nothing', async () => {
    const res = await deliver(envelope('approval.requested', approvalObject()), { secret: `whsec_${Buffer.alloc(32, 6).toString('base64')}` });
    expect(res.status).toBe(401);
    expect(s.repo.tables.webhook_events).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('rejects a stale timestamp with 401', async () => {
    const res = await deliver(envelope('approval.requested', approvalObject()), { at: new Date(NOW.getTime() - 6 * 60_000) });
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('pushes the approval title to the owners with the approval data and category', async () => {
    const res = await deliver(envelope('approval.requested', approvalObject()));
    expect(res.status).toBe(200);
    expect(approvals.calls).toEqual([{ accountId: ACCOUNT, approvalId: APPROVAL }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.businessId).toBe(s.business.id);
    expect(sent[0]!.userIds).toEqual(['user_owner']);
    expect(sent[0]!.message).toEqual({
      title: 'Clovie needs your OK',
      body: 'Cancel Gel overlay on Fri 10 Oct, 10:00?',
      categoryId: 'clovie_approval',
      data: { type: 'approval', approvalId: APPROVAL, businessId: s.business.id },
    });
    expect(s.repo.tables.webhook_events[0]).toMatchObject({ source: 'nerova', processed_at: expect.any(String) });
  });

  it('pushes once when Nerova redelivers the same webhook-id', async () => {
    await deliver(envelope('approval.requested', approvalObject()), { id: 'evt_dup' });
    const second = await deliver(envelope('approval.requested', approvalObject()), { id: 'evt_dup' });
    expect(second.body).toEqual({ data: { status: 'duplicate' } });
    expect(sent).toHaveLength(1);
  });

  it('ignores an unknown account (unknown, missing or non-UUID external reference)', async () => {
    const refs = ['00000000-0000-4000-8000-00000000dead', null, 'salon-4821'];
    for (const externalReference of refs) {
      expect((await deliver(envelope('approval.requested', approvalObject({ externalReference })))).status).toBe(200);
    }
    expect(sent).toHaveLength(0);
  });

  it('sends nothing for an approval that is no longer pending', async () => {
    approvals.pending = [];
    const res = await deliver(envelope('approval.requested', approvalObject()));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('ignores other event types with 200', async () => {
    const res = await deliver(envelope('booking.created', { accountId: ACCOUNT, externalReference: s.business.id }));
    expect(res).toEqual({ status: 200, body: { data: { status: 'ignored' } } });
    expect(approvals.calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('marks the event unprocessed when the approval lookup fails', async () => {
    approvals.findPendingApproval = async () => {
      throw new Error('nerova down');
    };
    const res = await deliver(envelope('approval.requested', approvalObject()));
    expect(res.status).toBe(200);
    expect(s.repo.tables.webhook_events[0]).toMatchObject({ processed_at: null, error: 'PUSH_FAILED' });
  });
});
