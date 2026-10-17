import { describe, expect, it } from 'vitest';

import { createNerovaClientChannel } from '@booking/companion/nerova/clientChannel.ts';
import type { NerovaNotification } from '@booking/app-store/whatsapp/notifications/nerovaChannel.ts';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { createMemoryPlanRepository } from '@booking/testing/plans.ts';
import type { PlanKey } from '@booking/types';

const BIZ = '10000000-0000-4000-8000-0000000000aa';
const note: NerovaNotification = { to: '+27821234567', type: 'update', clientName: 'Jane', businessName: 'Studio Luma', serviceName: 'Balayage', when: 'Fri 6 Feb at 10:00', message: 'Your Balayage is booked.' };

function channel(opts: { plan?: PlanKey; apiKey?: string | undefined; status?: number; body?: unknown; cached?: string | null }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchSpy = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(opts.body ?? {}), { status: opts.status ?? 202 });
  }) as unknown as typeof fetch;
  const plans = createMemoryPlanRepository({ [BIZ]: { plan: opts.plan ?? 'growth', timezone: 'Africa/Johannesburg', nerovaAccountId: opts.cached ?? null } }, []);
  const ch = createNerovaClientChannel({
    apiKey: 'apiKey' in opts ? opts.apiKey : 'nrv_live_secret',
    entitlements: fakeEntitlements(opts.plan ?? 'growth'),
    plans,
    baseUrl: 'https://nerova.test',
    fetch: fetchSpy,
  });
  return { ch, calls };
}

describe('NerovaClientChannel', () => {
  it('owns the number of a companion-plan business only', async () => {
    expect(await channel({ plan: 'growth' }).ch.ownsNumber(BIZ)).toBe(true);
    expect(await channel({ plan: 'free' }).ch.ownsNumber(BIZ)).toBe(false);
  });

  it('posts the notification with the partner key, the idempotency key and an actor', async () => {
    const { ch, calls } = channel({ cached: 'acct_100' });
    expect(await ch.send(BIZ, note, 'appt-created-1')).toBe('sent');
    expect(calls[0]!.url).toBe('https://nerova.test/v1/accounts/acct_100/notifications');
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer nrv_live_secret', 'Idempotency-Key': 'appt-created-1' });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ...note, actor: { actorReference: 'system:booking-platform' } });
  });

  it('falls back to our business id as the account reference', async () => {
    const { ch, calls } = channel({});
    await ch.send(BIZ, note, 'k');
    expect(calls[0]!.url).toBe(`https://nerova.test/v1/accounts/${BIZ}/notifications`);
  });

  it('treats a STOP as opted_out and any other failure as an upstream error without the key', async () => {
    expect(await channel({ status: 409, body: { code: 'notifications.recipient_opted_out' } }).ch.send(BIZ, note, 'k')).toBe('opted_out');
    const failure = await channel({ status: 409, body: { code: 'channels.not_ready' } }).ch.send(BIZ, note, 'k').then(() => null, (e: unknown) => e as Error & { code: string; details: unknown });
    expect(failure?.code).toBe('UPSTREAM_COMPANION_ERROR');
    expect(JSON.stringify(failure?.details)).not.toContain('nrv_live_secret');
  });

  it('cannot send without an API key, and nothing leaves the process', async () => {
    const { ch, calls } = channel({ apiKey: undefined });
    await expect(ch.send(BIZ, note, 'k')).rejects.toMatchObject({ code: 'COMPANION_NOT_READY' });
    expect(calls).toHaveLength(0);
  });
});
