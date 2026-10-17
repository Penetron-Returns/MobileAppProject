import PostHog from 'posthog-react-native';

import { safeProperties } from './events';
import type { Analytics } from './port';

export interface PostHogConfig {
  key: string;
  host: string;
}

/**
 * The PostHog adapter, and the only file that imports the SDK. Autocapture and
 * session replay are off (a plain client has no autocapture; replay is
 * disabled explicitly), no lifecycle or screen events are sent, and every
 * event passes through `safeProperties`. Person profiles are created only on
 * `identify`, so anonymous pre-sign-in events stay anonymous.
 */
export function createPostHogAnalytics({
  key,
  host,
}: PostHogConfig): Analytics {
  const client = new PostHog(key, {
    host,
    enableSessionReplay: false,
    captureAppLifecycleEvents: false,
    personProfiles: 'identified_only',
    persistence: 'file',
  });
  return {
    track: (event, props) => {
      client.capture(event, safeProperties(props));
    },
    identify: (userId) => client.identify(userId),
    group: (type, id) => client.group(type, id),
    reset: () => client.reset(),
  };
}
