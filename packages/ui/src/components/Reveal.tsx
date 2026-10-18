import * as React from 'react';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { DURATION, staggerDelay } from '../tokens/motion';

/** Scopes whose first batch of rows has already played its entrance. */
const played = new Set<string>();
/** How long after the first row mounts the rest of the first batch may still animate. */
const FIRST_BATCH_MS = 700;

/** Only the first rows animate: a long list never makes the user wait for a stagger. */
const MAX_ANIMATED_ROWS = 6;

export interface RevealProps {
  /** Which list this row belongs to ("today", "services"). The entrance plays once per scope. */
  scope: string;
  /** Row position, for the stagger. Capped, so a long list never waits. */
  index: number;
  /** The list came from the saved cache (already on screen at launch): show it still. */
  skip?: boolean;
  children: React.ReactNode;
}

/**
 * Fades a list row in and up on the first load of its list, staggered by
 * position. Later mounts of the same scope (refetches, new rows, scrolling a
 * virtualised list) render still, and reduced motion makes it instant. The
 * entrance runs on the UI thread and never blocks a tap.
 */
export function Reveal({ scope, index, skip, children }: RevealProps) {
  // Decided once at mount: the batch that mounts together all animate.
  const [animate] = React.useState(
    () => !skip && index < MAX_ANIMATED_ROWS && !played.has(scope),
  );
  React.useEffect(() => {
    // Not cleared on unmount: leaving early still counts as having seen it.
    setTimeout(() => played.add(scope), FIRST_BATCH_MS);
  }, [scope]);
  if (!animate) return <>{children}</>;
  return (
    <Animated.View
      entering={FadeInDown.delay(staggerDelay(index))
        .duration(DURATION.standard)
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}
