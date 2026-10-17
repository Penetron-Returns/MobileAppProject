import { describe, expect, it } from 'vitest';

import type { CompanionChatSession } from '@booking/companion/nerova/chatClient.ts';
import { parseChatStream } from '@booking/companion/nerova/chatStream.ts';
import { createHttpCompanionChatClient } from '@booking/companion/nerova/httpChatClient.ts';
import { createHttpNerovaClient } from '@booking/companion/nerova/httpClient.ts';
import { createCompanionSettingsService } from '@booking/companion/nerova/settings.ts';
import type { VoiceAskService } from '@booking/companion/nerova/voiceAsk.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { AuditEntry } from '@booking/features/repositories/types.ts';
import { createFakeNerovaClient } from '@booking/testing/nerova.ts';
import { createMemoryPlanRepository } from '@booking/testing/plans.ts';
import { createDeviceTokenService } from '@booking/features/voice/deviceTokens.ts';
import { createMemoryDeviceTokenRepository } from '@booking/testing/voiceTokens.ts';
import { isDeviceTokenRoute } from '../../src/middleware/deviceToken.ts';
import { BIZ, ORG, OWNER_ID, plansHarness } from './harness.ts';

const sse = (...frames: [string, unknown][]) => frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const actionFrame = (over: Record<string, unknown> = {}): [string, unknown] => [
  'action',
  {
    id: 'oact_1',
    kind: 'create_appointment',
    status: 'executed',
    title: 'Gel overlay, Fri 16 Oct, 20:30',
    readBack: "Done. Gel overlay on Fri 16 Oct at 20:30. Say undo if that's wrong.",
    lines: [{ label: 'When', from: null, to: 'Fri 16 Oct, 20:30' }],
    executedAt: '2026-10-16T08:00:00Z',
    undoUntil: '2026-10-16T08:00:30Z',
    undoable: true,
    ...over,
  },
];

describe('SSE action events', () => {
  it('parses an executed action and does not set awaitingReply', () => {
    const turn = parseChatStream(sse(['text-delta', { delta: 'Booked.' }], actionFrame(), ['done', { suggestions: [] }]));
    expect(turn.actions).toEqual([
      {
        id: 'oact_1',
        kind: 'create_appointment',
        status: 'executed',
        title: 'Gel overlay, Fri 16 Oct, 20:30',
        readBack: "Done. Gel overlay on Fri 16 Oct at 20:30. Say undo if that's wrong.",
        lines: [{ label: 'When', from: null, to: 'Fri 16 Oct, 20:30' }],
        executedAt: '2026-10-16T08:00:00Z',
        undoUntil: '2026-10-16T08:00:30Z',
        undoable: true,
      },
    ]);
    expect(turn.awaitingReply).toBeUndefined();
    expect(turn.approvals).toEqual([]);
  });

  it('the same id re-emitted as undone replaces the executed one in place', () => {
    const turn = parseChatStream(
      sse(actionFrame(), actionFrame({ id: 'oact_2', title: 'Other' }), actionFrame({ status: 'undone', undoneAt: '2026-10-16T08:00:10Z', undoable: false }), ['done', {}]),
    );
    expect(turn.actions.map((a) => [a.id, a.status])).toEqual([
      ['oact_1', 'undone'],
      ['oact_2', 'executed'],
    ]);
    expect(turn.actions[0]).toMatchObject({ undoneAt: '2026-10-16T08:00:10Z', undoable: false });
  });

  it('ignores an action without an id, kind or known status', () => {
    const turn = parseChatStream(sse(actionFrame({ id: undefined }), actionFrame({ status: 'pending' }), ['done', {}]));
    expect(turn.actions).toEqual([]);
  });
});

describe('undo proxy: Nerova error mapping', () => {
  const session: CompanionChatSession = { sessionId: 'wsn_1', state: 'secret-state' };
  const problem = (status: number, code: string) => new Response(JSON.stringify({ code }), { status, headers: { 'content-type': 'application/problem+json' } });
  const clientFor = (respond: (url: string, init: RequestInit) => Response) =>
    createHttpCompanionChatClient({ baseUrl: 'https://nerova.test', fetch: (async (url: string, init: RequestInit) => respond(url, init)) as typeof fetch });
  const catchError = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as AppError;

  it('posts to the undo route with the session headers and the idempotency key, and returns the action', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = clientFor((url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ ...actionFrame({ status: 'undone', undoneAt: '2026-10-16T08:00:10Z', undoable: false })[1] as object }), { status: 200 });
    });
    const action = await client.undoAction(session, 'oact_1', 'undo-key-12345');
    expect(seen!.url).toBe('https://nerova.test/v1/companion/actions/oact_1/undo');
    expect(seen!.init.method).toBe('POST');
    expect(seen!.init.headers).toMatchObject({ 'X-Widget-Session-Id': 'wsn_1', 'X-Widget-State': 'secret-state', 'Idempotency-Key': 'undo-key-12345' });
    expect(action).toMatchObject({ id: 'oact_1', status: 'undone', undoable: false });
  });

  it('maps 404 action.not_found to NOT_FOUND', async () => {
    const e = await catchError(clientFor(() => problem(404, 'action.not_found')).undoAction(session, 'oact_x', 'undo-key-12345'));
    expect(e.code).toBe('NOT_FOUND');
  });

  it.each(['action.undo_window_closed', 'action.not_undoable', 'action.undo_failed'])('maps 409 %s to RULE_VIOLATION with details.reason', async (reason) => {
    const e = await catchError(clientFor(() => problem(409, reason)).undoAction(session, 'oact_1', 'undo-key-12345'));
    expect(e.code).toBe('RULE_VIOLATION');
    expect(e.details?.reason).toBe(reason);
  });

  it('maps 503 action.connector_unavailable to a retryable upstream error', async () => {
    const e = await catchError(clientFor(() => problem(503, 'action.connector_unavailable')).undoAction(session, 'oact_1', 'undo-key-12345'));
    expect(e.code).toBe('UPSTREAM_COMPANION_ERROR');
    expect(e.details?.retryable).toBe(true);
  });

  it('lists executed actions with GET and the session headers', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = clientFor((url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ data: [actionFrame()[1]] }), { status: 200 });
    });
    const list = await client.listActions(session, 'executed');
    expect(seen!.url).toBe('https://nerova.test/v1/companion/actions?status=executed');
    expect(seen!.init.method).toBe('GET');
    expect(list.map((a) => a.id)).toEqual(['oact_1']);
  });
});

describe('voice action routes', () => {
  const action = { id: 'oact_1', kind: 'create_appointment', status: 'undone' as const, title: 'T', readBack: '', lines: [], executedAt: null, undoUntil: null, undoable: false };

  function routes(undo: VoiceAskService['undo']) {
    const repo = createMemoryDeviceTokenRepository();
    repo.addMember({ businessId: BIZ, userId: OWNER_ID, orgId: ORG, role: 'owner' });
    const listed: string[] = [];
    const voiceAsk: VoiceAskService = {
      ask: async () => ({ reply: '', approvals: [], suggestions: [] }),
      decide: async () => ({ id: 'x', decision: 'approved', kind: null }),
      undo,
      listActions: async (_c, status) => {
        listed.push(status);
        return [action];
      },
    };
    return { h: plansHarness({ overrides: { voiceTokens: createDeviceTokenService({ repo }), voiceAsk } }), listed };
  }

  it('POST /v1/voice/actions/:id/undo returns the action and forwards the Idempotency-Key', async () => {
    const keys: string[] = [];
    const { h } = routes(async (_c, id, key) => {
      keys.push(`${id}:${key}`);
      return action;
    });
    const res = await h.call('POST', '/v1/voice/actions/oact_1/undo', { key: 'undo-key-abcdef' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: action });
    expect(keys).toEqual(['oact_1:undo-key-abcdef']);
  });

  it('surfaces a closed window as RULE_VIOLATION with details.reason', async () => {
    const { h } = routes(async () => {
      throw new AppError('RULE_VIOLATION', 'That action can no longer be undone', { reason: 'action.undo_window_closed' });
    });
    const res = await h.call('POST', '/v1/voice/actions/oact_1/undo');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { reason: 'action.undo_window_closed' } });
  });

  it('GET /v1/voice/actions defaults to executed and rejects an unknown status', async () => {
    const { h, listed } = routes(async () => action);
    expect((await h.call('GET', '/v1/voice/actions')).body).toEqual({ data: [action] });
    await h.call('GET', '/v1/voice/actions?status=executed');
    expect(listed).toEqual(['executed', 'executed']);
    expect((await h.call('GET', '/v1/voice/actions?status=nope')).body.error.code).toBe('VALIDATION_FAILED');
  });

  it('a device voice token may call exactly these two routes', () => {
    expect(isDeviceTokenRoute('POST', '/v1/voice/actions/oact_1/undo')).toBe(true);
    expect(isDeviceTokenRoute('POST', '/api/v1/voice/actions/oact_1/undo')).toBe(true);
    expect(isDeviceTokenRoute('GET', '/v1/voice/actions')).toBe(true);
    expect(isDeviceTokenRoute('DELETE', '/v1/voice/actions/oact_1/undo')).toBe(false);
    expect(isDeviceTokenRoute('PATCH', '/v1/companion/settings')).toBe(false);
    expect(isDeviceTokenRoute('GET', '/v1/companion/settings')).toBe(false);
  });
});

describe('companion settings proxy', () => {
  function setup() {
    const nerova = createFakeNerovaClient({ accounts: [{ id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' }] });
    const plans = createMemoryPlanRepository({ [BIZ]: { plan: 'growth', timezone: 'Africa/Johannesburg', nerovaAccountId: 'acct_100' } }, []);
    const audits: AuditEntry[] = [];
    const companionSettings = createCompanionSettingsService({ nerova, plans, recordAudit: async (e) => void audits.push(e) });
    return { h: plansHarness({ plan: 'growth', overrides: { companionSettings } }), nerova, audits };
  }

  it('GET returns Nerova\'s settings for an owner', async () => {
    const { h } = setup();
    const res = await h.call('GET', '/v1/companion/settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ approvalPolicy: 'risky_only', undoWindowSeconds: 30, updatedAt: '2026-10-26T08:00:00.000Z' });
  });

  it('is owner only: staff get 403 on GET and PATCH and Nerova is never called', async () => {
    const { h, nerova } = setup();
    expect((await h.call('GET', '/v1/companion/settings', { token: 'staff' })).status).toBe(403);
    expect((await h.call('PATCH', '/v1/companion/settings', { token: 'staff', body: { undoWindowSeconds: 10 } })).status).toBe(403);
    expect(nerova.settingsUpdates).toEqual([]);
  });

  it('PATCH is partial, forwards the Idempotency-Key and records an audit_log entry', async () => {
    const { h, nerova, audits } = setup();
    const res = await h.call('PATCH', '/v1/companion/settings', { body: { undoWindowSeconds: 60 }, key: 'settings-key-123456' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ approvalPolicy: 'risky_only', undoWindowSeconds: 60 });
    expect(nerova.settingsUpdates).toEqual([{ accountId: 'acct_100', patch: { undoWindowSeconds: 60 }, idempotencyKey: 'settings-key-123456' }]);
    expect(audits).toEqual([
      expect.objectContaining({ businessId: BIZ, actorId: OWNER_ID, action: 'update', entity: 'companion_settings', entityId: BIZ, diff: { undoWindowSeconds: 60 } }),
    ]);
  });

  it('replays the stored response for a repeated key: one Nerova call, one audit entry', async () => {
    const { h, nerova, audits } = setup();
    const first = await h.call('PATCH', '/v1/companion/settings', { body: { approvalPolicy: 'always' }, key: 'settings-key-replay1' });
    const second = await h.call('PATCH', '/v1/companion/settings', { body: { approvalPolicy: 'always' }, key: 'settings-key-replay1' });
    expect(second.body).toEqual(first.body);
    expect(nerova.settingsUpdates).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it.each([
    ['an out-of-range window', { undoWindowSeconds: 121 }],
    ['a negative window', { undoWindowSeconds: -1 }],
    ['a fractional window', { undoWindowSeconds: 1.5 }],
    ['an unknown policy', { approvalPolicy: 'sometimes' }],
    ['an empty body', {}],
  ])('rejects %s with VALIDATION_FAILED before calling Nerova', async (_label, body) => {
    const { h, nerova, audits } = setup();
    const res = await h.call('PATCH', '/v1/companion/settings', { body });
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(nerova.settingsUpdates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('maps Nerova 400 settings.invalid to VALIDATION_FAILED and writes no audit entry', async () => {
    const fetchSpy = (async () => new Response(JSON.stringify({ code: 'settings.invalid' }), { status: 400 })) as unknown as typeof fetch;
    const nerova = createHttpNerovaClient({ apiKey: 'nrv_live_x', fetch: fetchSpy });
    const plans = createMemoryPlanRepository({ [BIZ]: { plan: 'growth', timezone: 'Africa/Johannesburg', nerovaAccountId: 'acct_100' } }, []);
    const audits: AuditEntry[] = [];
    const companionSettings = createCompanionSettingsService({ nerova, plans, recordAudit: async (e) => void audits.push(e) });
    const h = plansHarness({ plan: 'growth', overrides: { companionSettings } });
    const res = await h.call('PATCH', '/v1/companion/settings', { body: { undoWindowSeconds: 10 } });
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'settings.invalid' } });
    expect(audits).toEqual([]);
  });

  it('the HTTP client sends the partial body with PATCH, the bearer key and the Idempotency-Key', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchSpy = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ approvalPolicy: 'never', undoWindowSeconds: 0, updatedAt: '2026-10-26T09:00:00Z' }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createHttpNerovaClient({ apiKey: 'nrv_live_x', baseUrl: 'https://nerova.test', fetch: fetchSpy });
    const out = await client.updateCompanionSettings('acct_100', { approvalPolicy: 'never' }, 'settings-key-123456');
    expect(seen!.url).toBe('https://nerova.test/v1/accounts/acct_100/companion/settings');
    expect(seen!.init.method).toBe('PATCH');
    expect(seen!.init.body).toBe('{"approvalPolicy":"never"}');
    expect(seen!.init.headers).toMatchObject({ Authorization: 'Bearer nrv_live_x', 'Idempotency-Key': 'settings-key-123456' });
    expect(out).toEqual({ approvalPolicy: 'never', undoWindowSeconds: 0, updatedAt: '2026-10-26T09:00:00Z' });
  });
});
