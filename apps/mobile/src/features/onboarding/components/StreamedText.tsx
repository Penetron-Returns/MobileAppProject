import { Text, useReduceMotion } from '@booking/ui';
import * as React from 'react';

import { TYPE, useOnbColors } from '../theme';
import type { HeadingRef } from '../useScreenReader';

/** Words appear 55ms apart, and the whole line never takes longer than STREAM_MAX_MS. */
const WORD_MS = 55;
const STREAM_MAX_MS = 450;
const WORD = /\S+\s*/g;

/** Splits `text` after the first `count` words: what is shown, and what is still to come. */
export function revealed(text: string, count: number): [string, string] {
  const words = text.match(WORD) ?? [];
  const shown = words.slice(0, count).join('');
  return [shown, text.slice(shown.length)];
}

/**
 * The screen's heading, streamed in word by word the way Clovie "says" it
 * (visual only: nothing on the screen waits for it). The words still to come are transparent, so the line breaks never
 * move. Screen readers get the whole sentence at once; Reduce Motion shows it whole.
 */
export function StreamedText({
  text,
  headingRef,
}: {
  text: string;
  headingRef?: HeadingRef;
}) {
  const c = useOnbColors();
  const isReduced = useReduceMotion();
  const total = (text.match(WORD) ?? []).length;
  const [count, setCount] = React.useState(isReduced ? total : 0);

  React.useEffect(() => {
    if (isReduced) {
      setCount(total);
      return;
    }
    setCount(0);
    let n = 0;
    const id = setInterval(
      () => {
        n += 1;
        setCount(n);
        if (n >= total) clearInterval(id);
      },
      Math.min(WORD_MS, STREAM_MAX_MS / Math.max(1, total)),
    );
    return () => clearInterval(id);
  }, [text, total, isReduced]);

  const [shown, rest] = revealed(text, count);
  return (
    <Text
      ref={headingRef}
      role="heading"
      aria-level="1"
      accessibilityLabel={text.replace(/\s+/g, ' ')}
      accessibilityLiveRegion="polite"
      style={[TYPE.title, { color: c.label }]}
    >
      {shown}
      <Text style={[TYPE.title, { color: 'transparent' }]}>{rest}</Text>
    </Text>
  );
}
