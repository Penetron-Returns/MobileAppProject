import type { Buffer } from 'node:buffer';

import { hmacSha256Hex, safeEqual } from '../lib/crypto.ts';

/** Verifies Meta's `X-Hub-Signature-256: sha256=<hex>` over the raw body (constant time). */
export function verifyMetaSignature(appSecret: string | undefined, rawBody: Buffer | string, header: string | undefined | null): boolean {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = `sha256=${hmacSha256Hex(appSecret, rawBody)}`;
  return safeEqual(header.trim().toLowerCase(), expected);
}

export function signMetaBody(appSecret: string, rawBody: Buffer | string): string {
  return `sha256=${hmacSha256Hex(appSecret, rawBody)}`;
}
