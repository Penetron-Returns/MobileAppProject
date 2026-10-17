import { noopAnalytics, type Analytics } from './port';

let current: Analytics = noopAnalytics;

/** Installs the adapter (root startup) or a fake (tests). Pass nothing to go back to no-op. */
export function setAnalytics(next: Analytics = noopAnalytics): void {
  current = next;
}

/**
 * The app-wide handle. It forwards to whichever adapter is installed, so
 * callers never hold a stale one and never need a provider in tests.
 */
export const analytics: Analytics = {
  track: (event, props) => current.track(event, props),
  identify: (userId) => current.identify(userId),
  group: (type, id) => current.group(type, id),
  reset: () => current.reset(),
};
