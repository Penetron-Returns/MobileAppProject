import { generateKeyPairSync, createSign } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { normalizePem } from '../src/lib/pem.ts';
import { defaultVerifier } from '../src/middleware/auth.ts';

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
