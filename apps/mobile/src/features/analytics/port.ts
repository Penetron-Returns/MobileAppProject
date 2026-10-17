import type { AnalyticsEventName, AnalyticsEvents } from './events';

/**
 * The analytics port: the one surface the rest of the app sees. Product code
 * never imports PostHog (or any vendor) directly; `posthogAnalytics.ts` is the
 * only adapter, and tests use `createFakeAnalytics`.
 */
export interface Analytics {
  track<E extends AnalyticsEventName>(
    event: E,
    props?: AnalyticsEvents[E],
  ): void;
  /** Links this device's anonymous events to the signed-in user (an id, never an email). */
  identify(userId: string): void;
  /** Attaches later events to a group, e.g. `group('business', businessId)`. */
  group(type: 'business', id: string): void;
  /** Forgets the user (sign-out), so the next person starts anonymous. */
  reset(): void;
}

export const noopAnalytics: Analytics = {
  track: () => undefined,
  identify: () => undefined,
  group: () => undefined,
  reset: () => undefined,
};
