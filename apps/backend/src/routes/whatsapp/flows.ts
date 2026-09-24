import { Buffer } from 'node:buffer';
import type { KeyObject } from 'node:crypto';

import { Hono } from 'hono';

import type { Env } from '../../env.ts';
import type { AppEnv } from '../../types.ts';
import { getWaDeps } from '../../whatsapp/deps.ts';
import { decryptFlowRequest, encryptFlowResponse, FlowDecryptError, loadFlowPrivateKey, type EncryptedFlowRequest } from '../../whatsapp/flows/crypto.ts';
import { handleFlowRequest, type FlowRequest } from '../../whatsapp/flows/handler.ts';
import { verifyMetaSignature } from '../../whatsapp/signature.ts';

/**
 * Mounted at /flows/whatsapp. Status codes follow Meta's Flows endpoint spec:
 * 421 = cannot decrypt (client re-fetches our public key), 427 = flow token
 * invalid or expired (flow is closed), 432 = request signature mismatch.
 */
export const whatsappFlowRoutes = new Hono<AppEnv>();

let keyCache: { pem: string; key: KeyObject } | undefined;

function privateKey(env: Env): KeyObject | null {
  const pem = env.WHATSAPP_FLOW_PRIVATE_KEY;
  if (!pem) return null;
  if (keyCache?.pem !== pem) keyCache = { pem, key: loadFlowPrivateKey(pem, env.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE) };
  return keyCache.key;
}

whatsappFlowRoutes.post('/', async (c) => {
  const container = c.get('container');
  const logger = c.get('logger');
  const raw = Buffer.from(await c.req.arrayBuffer());

  const signature = c.req.header('x-hub-signature-256');
  if (signature && !verifyMetaSignature(container.env.META_APP_SECRET, raw, signature)) {
    logger.warn('wa_flow_bad_signature');
    return c.body(null, 432 as 400);
  }

  let key: KeyObject | null;
  try {
    key = privateKey(container.env);
  } catch {
    key = null;
  }
  if (!key) {
    logger.error('wa_flow_key_missing');
    return c.body(null, 421 as 400);
  }

  let decrypted: ReturnType<typeof decryptFlowRequest>;
  try {
    const body = JSON.parse(raw.toString('utf8')) as EncryptedFlowRequest;
    decrypted = decryptFlowRequest(body, key);
  } catch (err) {
    logger.warn('wa_flow_decrypt_failed', { kind: err instanceof FlowDecryptError ? 'decrypt' : 'parse' });
    return c.body(null, 421 as 400);
  }

  const result = await handleFlowRequest(getWaDeps(container, logger), (decrypted.payload ?? {}) as FlowRequest);
  if (result.status === 427) return c.body(null, 427 as 400);
  c.header('content-type', 'text/plain');
  return c.body(encryptFlowResponse(result.body, decrypted.aesKey, decrypted.iv), 200);
});
