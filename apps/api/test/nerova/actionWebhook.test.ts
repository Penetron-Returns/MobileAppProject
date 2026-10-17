import { beforeEach, describe, expect, it } from 'vitest';

import { signStandardWebhook } from '@booking/companion/events/events.ts';
import type { ExecutedAction, NerovaActionsClient } from '@booking/companion/nerova/actions.ts';
import type { ActionPushDeps } from '@booking/companion/approvals/actionPush.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { createMemoryAttendanceRepository } from '@booking/testing/attendanceMemory.ts';
import type { AttendancePushMessage } from '@booking/features/attendance/ports.ts';
import { createApp } from '../../src/app.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer, type BookingContainer } from '../helpers.ts';
import { silentLogger } from '../booking/harness.ts';
import { NOW, seed, type Seed } from '../booking/fixtures.ts';

const SECRET = `whsec_${Buffer.alloc(32, 5).toString('base64')}`;
const ACCOUNT = 'acct_1';
const ACTION = 'oact_1';

class FakeActions implements NerovaActionsClient {
  action: ExecutedAction | null = { id: ACTION, kind: 'create_appointment', title: 'Gel overlay, Fri 16 Oct, 20:30' };
  failWith: Error | null = null;
  calls: { accountId: string; actionId: string }[] = [];
  async getAction(accountId: string, actionId: string) {
    this.calls.push({ accountId, actionId });
    if (this.failWith) throw this.failWith;
    return this.action;
  }
}

let s: Seed;
let actions: FakeActions;
let sent: { businessId: string; userIds: string[]; message: AttendancePushMessage }[];
let app: ReturnType<typeof createApp>;
let seq = 0;

beforeEach(() => {
  s = seed();
  actions = new FakeActions();
  s.repo.tables.users.push(
    { id: 'user_owner', business_id: s.business.id, role: 'owner', email: null, display_name: null, avatar_url: null },
    { id: 'user_staff', business_id: s.business.id, role: 'staff', email: null, display_name: null, avatar_url: null },
  );
  sent = [];
  const actionPush: ActionPushDeps = {
    actions,
    repo: createMemoryAttendanceRepository(s.repo.tables, () => NOW),
    push: {
      async toUsers(businessId, userIds, message) {
        sent.push({ businessId, userIds, message });
        return userIds.length;
      },
    },
    logger: silentLogger,
    clock: () => NOW,
  };
  const container = { ...testContainer({ clock: () => NOW, env: { ...TEST_ENV, NEROVA_WEBHOOK_SECRET: SECRET } }), bookingRepository: s.repo, actionPush } as BookingContainer;
  app = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });
});

const inSeconds = (n: number) => new Date(NOW.getTime() + n * 1000).toISOString();
const object = (over: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT,
  externalReference: s.business.id,
  actionId: ACTION,
  kind: 'create_appointment',
  executedAt: NOW.toISOString(),
  undoUntil: inSeconds(30),
  ...over,
});

async function deliver(type: string, obj: Record<string, unknown>, id?: string) {
  seq += 1;
  const webhookId = id ?? `evt_${seq}`;
  const raw = JSON.stringify({ id: webhookId, type, apiVersion: '2026-07-01', createdAt: NOW.toISOString(), livemode: true, data: { object: obj } });
  const ts = Math.floor(NOW.getTime() / 1000);
  const res = await app.request('/webhooks/nerova', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': webhookId, 'webhook-timestamp': String(ts), 'webhook-signature': signStandardWebhook(SECRET, webhookId, ts, raw) },
    body: raw,
  });
  await new Promise((r) => setTimeout(r, 0));
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('action.executed', () => {
  it('pushes "Clovie booked it" to the owners with the action title, an Undo category and the undo data', async () => {
    const res = await deliver('action.executed', object());
    expect(res.status).toBe(200);
    expect(actions.calls).toEqual([{ accountId: ACCOUNT, actionId: ACTION }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.userIds).toEqual(['user_owner']);
    expect(sent[0]!.message).toEqual({
      title: 'Clovie booked it',
      body: 'Gel overlay, Fri 16 Oct, 20:30',
      categoryId: 'clovie_action',
      data: { type: 'action', actionId: ACTION, businessId: s.business.id, undoUntil: inSeconds(30) },
    });
  });

  it('skips the push when the undo window has already passed', async () => {
    await deliver('action.executed', object({ undoUntil: inSeconds(-1) }));
    expect(sent).toHaveLength(0);
    expect(actions.calls).toHaveLength(0);
  });

  it('still pushes, with a generic body, when the action title cannot be read', async () => {
    actions.failWith = new AppError('UPSTREAM_COMPANION_ERROR', 'down');
    await deliver('action.executed', object());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.message.body).toBe('Open Clovie to review, or undo it');
  });

  it('pushes once when Nerova redelivers the same webhook-id', async () => {
    await deliver('action.executed', object(), 'evt_dup');
    const second = await deliver('action.executed', object(), 'evt_dup');
    expect(second.body).toEqual({ data: { status: 'duplicate' } });
    expect(sent).toHaveLength(1);
  });
});

describe('action.undone', () => {
  it('sends no push', async () => {
    const res = await deliver('action.undone', { accountId: ACCOUNT, externalReference: s.business.id, actionId: ACTION, kind: 'create_appointment', undoneAt: NOW.toISOString() });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(res.body).toEqual({ data: { status: 'ignored' } });
  });

  it('records the event once and acknowledges a redelivery as a duplicate', async () => {
    const object = { accountId: ACCOUNT, externalReference: s.business.id, actionId: ACTION, kind: 'create_appointment', undoneAt: NOW.toISOString() };
    const first = await deliver('action.undone', object, 'evt_undo_dup');
    const second = await deliver('action.undone', object, 'evt_undo_dup');
    expect(first.body).toEqual({ data: { status: 'ignored' } });
    expect(second.body).toEqual({ data: { status: 'duplicate' } });
    expect(sent).toHaveLength(0);
  });
});
