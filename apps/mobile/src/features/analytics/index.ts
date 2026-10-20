import { analytics, setAnalytics } from './analytics';
import { noopAnalytics, type Analytics } from './port';

export { analytics, setAnalytics };
export type { Analytics };
export type { AnalyticsEvents } from './events';

export interface AnalyticsEnv {
  key: string;
  host: string;
}

/** The adapter for this config; no key means the no-op, so nothing is created or sent. */
export function createAnalytics(config: AnalyticsEnv): Analytics {
  if (!config.key) return noopAnalytics;
  // Loaded only when a key exists, so a build without one never touches the SDK.
  const { createPostHogAnalytics } =
    require('./posthogAnalytics') as typeof import('./posthogAnalytics');
  return createPostHogAnalytics(config);
}

/** Root startup: installs the adapter once. Safe to call without a key. */
export function initAnalytics(config: AnalyticsEnv): void {
  try {
    setAnalytics(createAnalytics(config));
  } catch {
    // Analytics must never be able to stop the app from starting.
    setAnalytics(noopAnalytics);
  }
}
