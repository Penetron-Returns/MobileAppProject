/**
 * The native app builds Nerova has registered (apps/mobile/app.config.ts, apps/api/scripts/register-nerova-native-app.mjs).
 * The app names its own build in a header; only these ids are ever honoured, and each fixes the WhatsApp return scheme.
 */
export const NATIVE_APPS = [
  { appId: 'si.nerova.booking.dev', returnUrlScheme: 'bookingadmin' },
  { appId: 'app.getclovie.preview', returnUrlScheme: 'clovie-preview' },
  { appId: 'app.getclovie', returnUrlScheme: 'clovie' },
] as const;

/** Header the app sends with its application id (Android package / iOS bundle id). */
export const APP_ID_HEADER = 'x-clovie-app-id';

export const DEFAULT_NATIVE_APP_ID = 'si.nerova.booking.dev';

/** The registered app for an id, or undefined for anything not on the allow-list. */
export function findNativeApp(appId: string | undefined | null): (typeof NATIVE_APPS)[number] | undefined {
  const id = appId?.trim();
  return id ? NATIVE_APPS.find((app) => app.appId === id) : undefined;
}

/** The requested id when allow-listed, else the configured fallback (NEROVA_APP_ID), else the default. Never returns an unvalidated request value. */
export function resolveNativeAppId(requested: string | undefined | null, fallback?: string | undefined): string {
  return findNativeApp(requested)?.appId ?? (fallback || DEFAULT_NATIVE_APP_ID);
}

/**
 * True when the return URL's scheme is the one registered for the app the caller named. A missing or unknown id (an installed build
 * that predates the header) is not scheme-checked: it falls back to NEROVA_APP_ID and the plain return-URL allow-list.
 */
export function isReturnUrlForApp(returnUrl: string, requestedAppId: string | undefined | null): boolean {
  const app = findNativeApp(requestedAppId);
  return !app || returnUrl.startsWith(`${app.returnUrlScheme}://`);
}
