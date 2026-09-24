/**
 * WhatsApp Flows endpoint encryption (Meta spec):
 *  - the AES key is RSA-OAEP (SHA-256) encrypted with our public key;
 *  - the request body is AES-GCM encrypted (128-bit key), 16-byte tag appended;
 *  - the response is encrypted with the same key and the bit-inverted IV,
 *    returned as base64 text (ciphertext || tag).
 */
import { Buffer } from 'node:buffer';
import { constants, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, privateDecrypt, type KeyObject } from 'node:crypto';

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

/** Accepts a PEM with real newlines or with `\n` escapes (env vars). */
export function loadFlowPrivateKey(pem: string, passphrase?: string): KeyObject {
  const normalised = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  return createPrivateKey({ key: normalised, format: 'pem', ...(passphrase ? { passphrase } : {}) });
}

export function flowPublicKeyPem(privateKey: KeyObject): string {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}

const gcm = (key: Buffer) => `aes-${key.length * 8}-gcm` as 'aes-128-gcm';

export function decryptFlowRequest(body: EncryptedFlowRequest, privateKey: KeyObject): { payload: unknown; aesKey: Buffer; iv: Buffer } {
  try {
    const aesKey = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(body.encrypted_aes_key, 'base64'),
    );
    const iv = Buffer.from(body.initial_vector, 'base64');
    const data = Buffer.from(body.encrypted_flow_data, 'base64');
    const TAG = 16;
    if (data.length <= TAG) throw new FlowDecryptError();
    const decipher = createDecipheriv(gcm(aesKey), aesKey, iv);
    decipher.setAuthTag(data.subarray(data.length - TAG));
    const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - TAG)), decipher.final()]).toString('utf8');
    return { payload: JSON.parse(plain), aesKey, iv };
  } catch (err) {
    if (err instanceof FlowDecryptError) throw err;
    throw new FlowDecryptError();
  }
}

export function invertIv(iv: Buffer): Buffer {
  return Buffer.from(iv.map((b) => ~b & 0xff));
}

export function encryptFlowResponse(response: unknown, aesKey: Buffer, iv: Buffer): string {
  const cipher = createCipheriv(gcm(aesKey), aesKey, invertIv(iv));
  const ct = Buffer.concat([cipher.update(JSON.stringify(response), 'utf8'), cipher.final()]);
  return Buffer.concat([ct, cipher.getAuthTag()]).toString('base64');
}
