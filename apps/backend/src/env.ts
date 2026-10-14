import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  CLERK_SECRET_KEY: optional,
  CLERK_JWT_KEY: optional,
  CLERK_AUTHORIZED_PARTIES: optional,
  CLERK_WEBHOOK_SECRET: optional,

  META_APP_ID: optional,
  META_APP_SECRET: optional,
  META_GRAPH_VERSION: z.string().default('v23.0'),
  WHATSAPP_VERIFY_TOKEN: optional,
  WHATSAPP_FLOW_PRIVATE_KEY: optional,
  WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE: optional,
  WHATSAPP_REGISTRATION_PIN: optional,

  TOKEN_ENCRYPTION_KEY: optional,
  FLOW_TOKEN_SECRET: optional,
  CRON_SECRET: optional,
  /** Public base URL of this API, e.g. https://<ref>.supabase.co/functions/v1/api (used for Flows endpoint_uri) */
  API_BASE_URL: optional,
  PUBLIC_WEB_BOOKING_URL: optional,
  EXPO_ACCESS_TOKEN: optional,

  /** Stripe, server-side only. No code uses these yet (subscriptions are planned). */
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parses process.env once per warm Edge Function instance. */
export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  if (source === process.env && cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid backend environment: ${missing}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/** Throws a clear error when a feature-specific variable is missing. */
export function requireEnv<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}
