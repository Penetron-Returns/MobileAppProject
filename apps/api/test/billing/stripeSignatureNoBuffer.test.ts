import { afterEach, describe, expect, it } from 'vitest';

import { signStripePayload, verifyStripeSignature } from '@booking/features/billing/lib/stripeSignature.ts';

const SECRET = 'whsec_test_secret';
const NOW = new Date('2026-10-18T10:00:00Z');
const TS = Math.floor(NOW.getTime() / 1000);
const originalBuffer = globalThis.Buffer;

/** Supabase Edge (Deno) has no global Buffer. */
function removeGlobalBuffer(): void {
  Reflect.deleteProperty(globalThis, 'Buffer');
  expect(typeof (globalThis as { Buffer?: unknown }).Buffer).toBe('undefined');
}

afterEach(() => {
  globalThis.Buffer = originalBuffer;
});

describe('verifyStripeSignature without global Buffer', () => {
  it('accepts a correctly signed payload', () => {
    const body = '{"id":"evt_1"}';
    const header = signStripePayload(SECRET, body, TS);
    removeGlobalBuffer();
    expect(verifyStripeSignature(SECRET, body, header, NOW)).toEqual({ ok: true });
  });

  it('rejects a tampered payload and a non-hex signature', () => {
    const header = signStripePayload(SECRET, '{"id":"evt_1"}', TS);
    removeGlobalBuffer();
    expect(verifyStripeSignature(SECRET, '{"id":"evt_2"}', header, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyStripeSignature(SECRET, 'x', `t=${TS},v1=zz`, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('accepts when any of several v1 signatures matches', () => {
    const body = 'abc';
    const good = signStripePayload(SECRET, body, TS).split('v1=')[1];
    removeGlobalBuffer();
    expect(verifyStripeSignature(SECRET, body, `t=${TS},v1=${'0'.repeat(64)},v1=${good}`, NOW)).toEqual({ ok: true });
  });
});
