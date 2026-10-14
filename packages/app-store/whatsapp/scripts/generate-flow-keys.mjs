#!/usr/bin/env node
/**
 * Generates the RSA-2048 key pair for the WhatsApp Flows endpoint.
 *
 *   node packages/app-store/whatsapp/scripts/generate-flow-keys.mjs [passphrase]
 *
 * Prints:
 *   - WHATSAPP_FLOW_PRIVATE_KEY as a single line with \n escapes (paste into
 *     Vercel / .env; the backend accepts both escaped and real newlines);
 *   - WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE when one was given;
 *   - the public key PEM. The backend uploads it for you on connect/sync
 *     (POST /v1/whatsapp/sync); it is printed for manual upload only.
 *
 * Nothing is written to disk. Keep the private key out of git.
 */
import { generateKeyPairSync } from 'node:crypto';

const passphrase = process.argv[2] ?? '';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: passphrase
    ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
    : { type: 'pkcs8', format: 'pem' },
});

const oneLine = (pem) => pem.trim().replace(/\n/g, '\\n');

console.log(`WHATSAPP_FLOW_PRIVATE_KEY="${oneLine(privateKey)}"`);
if (passphrase) console.log(`WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE="${passphrase}"`);
console.log('\n# Public key (uploaded automatically by /v1/whatsapp/connect and /sync):');
console.log(publicKey.trim());
