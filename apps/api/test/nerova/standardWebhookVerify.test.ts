import { describe, expect, it } from 'vitest';

import { signStandardWebhook } from '@booking/companion/events/events.ts';
import { verifyStandardWebhook } from '@booking/companion/webhooks/verifyStandardWebhook.ts';

const secret = `whsec_${Buffer.alloc(32, 3).toString('base64')}`;
const other = `whsec_${Buffer.alloc(32, 4).toString('base64')}`;
const now = new Date('2026-10-16T10:00:00Z');
const ts = Math.floor(now.getTime() / 1000);
const body = '{"type":"approval.requested"}';
const sig = (key = secret, id = 'evt_1', t = ts, raw = body) => signStandardWebhook(key, id, t, raw);

describe('verifyStandardWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: String(ts), signature: sig() }, now)).toEqual({ ok: true });
  });

  it('accepts when any of several space-separated v1 signatures matches (rotated secret)', () => {
    const header = `${sig(other)} v2,ignored ${sig()}`;
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: String(ts), signature: header }, now).ok).toBe(true);
  });

  it.each([
    ['a wrong secret', () => sig(other)],
    ['a different id', () => sig(secret, 'evt_2')],
    ['a different timestamp', () => sig(secret, 'evt_1', ts + 1)],
    ['a tampered body', () => sig(secret, 'evt_1', ts, '{"type":"x"}')],
    ['a non v1 scheme', () => sig().replace('v1,', 'v2,')],
    ['an empty signature', () => ''],
  ])('rejects %s', (_name, make) => {
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: String(ts), signature: make() }, now)).toMatchObject({ ok: false });
  });

  it('rejects a stale timestamp and a timestamp from the future (beyond five minutes)', () => {
    const old = ts - 301;
    const future = ts + 301;
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: String(old), signature: sig(secret, 'evt_1', old) }, now)).toEqual({ ok: false, reason: 'stale_timestamp' });
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: String(future), signature: sig(secret, 'evt_1', future) }, now)).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('accepts a timestamp exactly at the five minute edge', () => {
    const edge = ts - 300;
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: String(edge), signature: sig(secret, 'evt_1', edge) }, now).ok).toBe(true);
  });

  it('rejects missing headers and a non numeric timestamp', () => {
    expect(verifyStandardWebhook(secret, body, { id: null, timestamp: String(ts), signature: sig() }, now)).toEqual({ ok: false, reason: 'missing_headers' });
    expect(verifyStandardWebhook(secret, body, { id: 'evt_1', timestamp: 'abc', signature: sig() }, now)).toEqual({ ok: false, reason: 'bad_timestamp' });
  });
});
