/**
 * Public runtime configuration. Expo inlines `process.env.EXPO_PUBLIC_*` at
 * bundle time, so every variable must be referenced literally here.
 */
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const env = {
  apiUrl,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
};

/**
 * PostHog (onboarding funnel only for now). Optional: with no key analytics is a
 * no-op, so it never reaches the missing-config screen.
 */
export const analyticsConfig = {
  key: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  host:
    (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '').trim() ||
    'https://eu.i.posthog.com',
};

export type EnvKey = keyof typeof env;

const ENV_NAMES: Record<EnvKey, string> = {
  apiUrl: 'EXPO_PUBLIC_API_URL',
  supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
  supabaseAnonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  clerkPublishableKey: 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
};

/** Names of required variables that are missing (for the config error screen). */
export function missingEnv(keys: EnvKey[] = Object.keys(env) as EnvKey[]) {
  return keys.filter((k) => !env[k]).map((k) => ENV_NAMES[k]);
}

/**
 * All four `EXPO_PUBLIC_*` variables are required for every screen (auth,
 * reads and writes all depend on them), so the root layout checks this once
 * at startup and renders a config-error screen instead of a runtime crash.
 */
export function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing = missingEnv();
  return missing.length ? { ok: false, missing } : { ok: true };
}
