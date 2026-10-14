import { generateKeyPairSync, createSign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizePem } from '../src/lib/pem.ts';
import { defaultVerifier, failureReason } from '../src/middleware/auth.ts';

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');

function signJwt(privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test' }));
  const body = b64url(JSON.stringify({ sub: 'user_1', org_id: 'org_1', iat: now - 5, nbf: now - 5, exp: now + 300 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKeyPem);
  return `${head}.${body}.${b64url(sig)}`;
}

describe('CLERK_JWT_KEY handling', () => {
  const original = process.env.CLERK_JWT_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.CLERK_JWT_KEY;
    else process.env.CLERK_JWT_KEY = original;
  });

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  it.each([
    ['real newlines', publicPem],
    ['literal \\n escapes', publicPem.trim().replace(/\n/g, '\\n')],
    ['quoted literal \\n escapes', `"${publicPem.trim().replace(/\n/g, '\\n')}"`],
  ])('verifies a token when the PEM has %s', async (_label, value) => {
    process.env.CLERK_JWT_KEY = value;
    const claims = await defaultVerifier(signJwt(privatePem));
    expect(claims.sub).toBe('user_1');
    expect(claims.org_id).toBe('org_1');
  });

  it('normalizePem turns escapes into real newlines and strips quotes', () => {
    expect(normalizePem(`'-----A-----\\nxx\\n-----B-----'`)).toBe('-----A-----\nxx\n-----B-----\n');
  });
});

describe('defaultVerifier authorized parties and failures', () => {
  const saved = { key: process.env.CLERK_JWT_KEY, parties: process.env.CLERK_AUTHORIZED_PARTIES };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = (k: typeof pair.publicKey) => k.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = pem(pair.publicKey);

  function sign(claims: Record<string, unknown>, key = privatePem): string {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test' }));
    const body = b64url(JSON.stringify({ sub: 'user_1', iat: now - 5, nbf: now - 5, exp: now + 300, ...claims }));
    const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key);
    return `${head}.${body}.${b64url(sig)}`;
  }

  beforeEach(() => {
    process.env.CLERK_JWT_KEY = publicPem;
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:8081,bookingadmin://';
  });
  afterEach(() => {
    for (const [name, v] of [['CLERK_JWT_KEY', saved.key], ['CLERK_AUTHORIZED_PARTIES', saved.parties]] as const) {
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  });

  it('accepts a native token that has no azp claim', async () => {
    expect((await defaultVerifier(sign({}))).sub).toBe('user_1');
  });

  it('accepts a token whose azp is an authorized party', async () => {
    expect((await defaultVerifier(sign({ azp: 'bookingadmin://' }))).sub).toBe('user_1');
  });

  it('rejects a token whose azp is not an authorized party', async () => {
    await expect(defaultVerifier(sign({ azp: 'https://evil.example' }))).rejects.toMatchObject({
      reason: 'token-invalid-authorized-parties',
    });
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(defaultVerifier(sign({ iat: now - 900, nbf: now - 900, exp: now - 600 }))).rejects.toMatchObject({
      reason: 'token-expired',
    });
  });

  it('rejects a token signed with a different key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPem = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    await expect(defaultVerifier(sign({}, otherPem))).rejects.toMatchObject({ reason: 'token-invalid-signature' });
  });

  it('failureReason falls back to unknown for non-Clerk errors', () => {
    expect(failureReason(new Error('x'))).toBe('unknown');
    expect(failureReason({ reason: 'token-expired' })).toBe('token-expired');
  });
});
