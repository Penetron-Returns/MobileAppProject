import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build variants. `app.json` holds everything shared; this file overrides what differs per variant.
 * EAS sets `APP_VARIANT` per build profile (`eas.json`); unset means `development`, so a local
 * `expo prebuild` / `expo start` keeps producing the side-by-side dev app.
 *
 * The production Android application id `app.getclovie` is permanent once it is on Google Play.
 * Everything that must match it follows from `package` here: the Clerk native application, the
 * Nerova native app (server env `NEROVA_APP_ID`) and the generated manifest (deep-link hosts, the
 * voice module's notification and service names all derive from the package or the scheme).
 */
export type AppVariant = 'development' | 'preview' | 'production';

interface VariantConfig {
  name: string;
  /** Android application id and iOS bundle identifier */
  id: string;
  /** Deep-link scheme (Clerk OAuth return, WhatsApp connect return, voice links) */
  scheme: string;
}

const VARIANTS: Record<AppVariant, VariantConfig> = {
  development: {
    name: 'Clovie Dev',
    id: 'si.nerova.booking.dev',
    scheme: 'bookingadmin',
  },
  // Its own id so a sideloaded preview APK (EAS upload key) never clashes with the Play-signed app.
  preview: {
    name: 'Clovie Preview',
    id: 'app.getclovie.preview',
    scheme: 'clovie-preview',
  },
  production: { name: 'Clovie', id: 'app.getclovie', scheme: 'clovie' },
};

export function resolveVariant(raw: string | undefined): AppVariant {
  return raw === 'production' || raw === 'preview' ? raw : 'development';
}

/**
 * Push needs two secrets-ish inputs that are never committed (docs/push-setup.md):
 *  - `GOOGLE_SERVICES_JSON`: path to this variant's Firebase `google-services.json` (an EAS file
 *    environment variable resolves to a path on the build worker). Falls back to a git-ignored
 *    `./google-services.json` for local builds. Unset means Android builds without FCM, and
 *    `getExpoPushTokenAsync` then fails (the app tolerates that and just has no push).
 *  - `EAS_PROJECT_ID`: the Expo project id from `eas init`, required to mint an Expo push token.
 */
export function resolveGoogleServicesFile(
  env: NodeJS.ProcessEnv,
  fileExists: (path: string) => boolean,
): string | undefined {
  const fromEnv = env.GOOGLE_SERVICES_JSON?.trim();
  if (fromEnv) return fromEnv;
  return fileExists('./google-services.json')
    ? './google-services.json'
    : undefined;
}

export function resolveEasProjectId(
  env: NodeJS.ProcessEnv,
): string | undefined {
  return env.EAS_PROJECT_ID?.trim() || undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = VARIANTS[resolveVariant(process.env.APP_VARIANT)];
  const googleServicesFile = resolveGoogleServicesFile(process.env, existsSync);
  const projectId = resolveEasProjectId(process.env);
  return {
    ...config,
    name: variant.name,
    slug: config.slug ?? 'booking-admin',
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier: variant.id },
    android: {
      ...config.android,
      package: variant.id,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
    },
  };
};
