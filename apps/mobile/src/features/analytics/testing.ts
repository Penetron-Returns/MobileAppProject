import type { AnalyticsEventName } from './events';
import type { Analytics } from './port';

export interface RecordedEvent {
  event: AnalyticsEventName;
  props: Record<string, unknown>;
}

export interface FakeAnalytics extends Analytics {
  events: RecordedEvent[];
  identified: string[];
  groups: { type: string; id: string }[];
  resets: number;
  /** Event names in the order they were tracked. */
  names(): AnalyticsEventName[];
}

/** An in-memory adapter for tests: records everything, sends nothing. */
export function createFakeAnalytics(): FakeAnalytics {
  const fake: FakeAnalytics = {
    events: [],
    identified: [],
    groups: [],
    resets: 0,
    track: (event, props) => {
      fake.events.push({ event, props: { ...(props ?? {}) } });
    },
    identify: (userId) => {
      fake.identified.push(userId);
    },
    group: (type, id) => {
      fake.groups.push({ type, id });
    },
    reset: () => {
      fake.resets += 1;
    },
    names: () => fake.events.map((e) => e.event),
  };
  return fake;
}
