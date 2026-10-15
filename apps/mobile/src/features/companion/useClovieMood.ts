import * as React from 'react';

import {
  clovieMood,
  IDLE_ACTIVITY,
  reduceActivity,
  REPLIED_MS,
  type ClovieMood,
  type WidgetEvent,
} from './logic';

/**
 * Clovie's mood for the chat: feed it widget events, read the mood. The
 * "replied" reaction expires by itself after REPLIED_MS.
 */
export function useClovieMood(now: () => number = Date.now): {
  mood: ClovieMood;
  onWidgetEvent: (event: WidgetEvent) => void;
} {
  const [activity, setActivity] = React.useState(IDLE_ACTIVITY);
  const [tick, setTick] = React.useState(0);
  const mood = clovieMood(activity, now());

  React.useEffect(() => {
    if (activity.phase !== 'replied') return;
    const timer = setTimeout(
      () => setTick((n) => n + 1),
      Math.max(activity.since + REPLIED_MS - now(), 0),
    );
    return () => clearTimeout(timer);
  }, [activity, now, tick]);

  const onWidgetEvent = React.useCallback(
    (event: WidgetEvent) => {
      setActivity((current) => {
        const next = reduceActivity(current, event, now());
        return next.phase === current.phase && next.since === current.since
          ? current
          : next;
      });
    },
    [now],
  );
  return { mood, onWidgetEvent };
}
