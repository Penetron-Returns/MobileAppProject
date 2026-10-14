/**
 * WhatsApp Flows endpoint encryption (Meta spec):
 *  - the AES key is RSA-OAEP (SHA-256) encrypted with our public key;
 *  - the request body is AES-GCM encrypted (128-bit key), 16-byte tag appended;
 *  - the response is encrypted with the same key and the bit-inverted IV,
 *    returned as base64 text (ciphertext || tag).
 *
 * RSA-OAEP and AES-GCM run on WebCrypto (crypto.subtle): the Supabase Edge runtime
 * (Deno 2.1) rejects a KeyObject passed to node:crypto privateDecrypt with
 * "Invalid key type", while WebCrypto behaves identically in Node and Deno.
 * node:crypto is used only to parse the PEM (passphrase, PKCS#1/PKCS#8) into PKCS#8 DER.
 */
import { Buffer } from 'node:buffer';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { normalizePem } from '@booking/features/lib/pem.ts';

export interface EncryptedFlowRequest {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

export class FlowDecryptError extends Error {
  constructor(message = 'Could not decrypt flow request') {
    super(message);
    this.name = 'FlowDecryptError';
  }
}

/** Parsed private key: unencrypted PKCS#8 DER plus its public PEM; the CryptoKey is imported lazily. */
export interface FlowPrivateKey {
  readonly pkcs8: Uint8Array;
  readonly publicPem: string;
  cryptoKey?: Promise<CryptoKey>;
}

/** Accepts a PEM with real newlines or with `\n` escapes (env vars). */
export function loadFlowPrivateKey(pem: string, passphrase?: string): FlowPrivateKey {
  const normalised = normalizePem(pem);
  const keyObject = createPrivateKey({ key: normalised, format: 'pem', ...(passphrase ? { passphrase } : {}) });
  return {
    pkcs8: new Uint8Array(keyObject.export({ type: 'pkcs8', format: 'der' })),
    publicPem: createPublicKey(keyObject).export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function flowPublicKeyPem(privateKey: FlowPrivateKey): string {
  return privateKey.publicPem;
}

const TAG_BYTES = 16;

/** Copies into a plain ArrayBuffer-backed view, which is what the WebCrypto typings require. */
const bytes = (b: Uint8Array): Uint8Array<ArrayBuffer> => Uint8Array.from(b);

function rsaKey(privateKey: FlowPrivateKey): Promise<CryptoKey> {
  if (!privateKey.cryptoKey) {
    const pending = crypto.subtle.importKey('pkcs8', bytes(privateKey.pkcs8), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    privateKey.cryptoKey = pending;
    // A rejected import must not stay cached: every later request would fail until the isolate restarts.
    pending.catch(() => {
      if (privateKey.cryptoKey === pending) privateKey.cryptoKey = undefined;
    });
  }
  return privateKey.cryptoKey;
}

const aesKeyFor = (raw: Uint8Array, usage: 'encrypt' | 'decrypt') => crypto.subtle.importKey('raw', bytes(raw), { name: 'AES-GCM' }, false, [usage]);

export async function decryptFlowRequest(
  body: EncryptedFlowRequest,
  privateKey: FlowPrivateKey,
): Promise<{ payload: unknown; aesKey: Buffer; iv: Buffer }> {
  try {
    const wrapped = Buffer.from(body.encrypted_aes_key, 'base64');
    const aesKey = Buffer.from(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, await rsaKey(privateKey), bytes(wrapped)));
    const iv = Buffer.from(body.initial_vector, 'base64');
    const data = Buffer.from(body.encrypted_flow_data, 'base64');
    if (data.length <= TAG_BYTES) throw new FlowDecryptError();
    // WebCrypto AES-GCM takes ciphertext || tag, which is exactly Meta's wire format.
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv), tagLength: TAG_BYTES * 8 }, await aesKeyFor(aesKey, 'decrypt'), bytes(data));
    return { payload: JSON.parse(Buffer.from(plain).toString('utf8')), aesKey, iv };
  } catch (err) {
    if (err instanceof FlowDecryptError) throw err;
    throw new FlowDecryptError();
  }
}

export function invertIv(iv: Buffer): Buffer {
  return Buffer.from(iv.map((b) => ~b & 0xff));
}

export async function encryptFlowResponse(response: unknown, aesKey: Buffer, iv: Buffer): Promise<string> {
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bytes(invertIv(iv)), tagLength: TAG_BYTES * 8 },
    await aesKeyFor(aesKey, 'encrypt'),
    bytes(Buffer.from(JSON.stringify(response), 'utf8')),
  );
  return Buffer.from(sealed).toString('base64');
}
