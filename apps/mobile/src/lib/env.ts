/**
 * Public runtime configuration. Expo inlines `process.env.EXPO_PUBLIC_*` at
 * bundle time, so every variable must be referenced literally here.
 */
/** The scheme://host[:port] part of a URL, or '' when it is not one. */
export function originOf(url: string): string {
  return /^(https?:\/\/[^/?#]+)/i.exec(url.trim())?.[1] ?? '';
}

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const env = {
  apiUrl,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
};

/**
 * The origin the companion page claims to be served from. Nerova only frames
 * a session for an origin on its allowlist, so this must equal the backend's
 * NEROVA_EMBED_ORIGIN. Optional: defaults to the API's own origin.
 */
export const companionOrigin: string =
  originOf(process.env.EXPO_PUBLIC_COMPANION_ORIGIN ?? '') || originOf(apiUrl);

/**
 * Opt-in flag for Nerova's native companion SDK: '1' swaps the iframe sheet
 * for the SDK sheet. Anything else (including unset) keeps the iframe. Not in
 * `env`: it is optional, so it must never reach the missing-config screen.
 */
export const companionSdkEnabled: boolean =
  process.env.EXPO_PUBLIC_COMPANION_SDK === '1';

/**
 * Which Nerova companion API the SDK talks to: 'v1' (native sessions, the new
 * versioned API) or anything else, including unset, for 'legacy' (the owner-chat
 * routes the iframe uses). v1 is not live yet. Optional, so not in `env`.
 */
export type NerovaApi = 'legacy' | 'v1';
export const nerovaApi: NerovaApi =
  process.env.EXPO_PUBLIC_NEROVA_API === 'v1' ? 'v1' : 'legacy';

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
