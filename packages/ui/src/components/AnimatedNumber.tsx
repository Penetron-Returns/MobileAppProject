import * as React from 'react';

import { COUNT_UP_MS, countUpValue } from '../lib/countUp';
import { Text } from '../primitives/Text';
import { useReduceMotion } from '../theme/useReduceMotion';

export interface AnimatedNumberProps extends Omit<
  React.ComponentProps<typeof Text>,
  'children'
> {
  /** The final value, in the unit `format` expects (integer cents for money). */
  value: number;
  /** Turns a value into text: `(cents) => formatMoney(cents, 'ZAR')`. */
  format?: (value: number) => string;
  /** Count duration in milliseconds. */
  duration?: number;
}

/**
 * A number that counts up from 0 on first show and from its previous value on
 * change, easing out. Tabular numerals keep the width steady. Screen readers
 * always get the final formatted value, never a frame in between, and reduced
 * motion shows the final value at once.
 */
export function AnimatedNumber({
  value,
  format = String,
  duration = COUNT_UP_MS,
  style,
  ...rest
}: AnimatedNumberProps) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = React.useState(reduceMotion ? value : 0);
  const shownRef = React.useRef(shown);
  shownRef.current = shown;

  React.useEffect(() => {
    if (reduceMotion || duration <= 0) {
      setShown(value);
      return;
    }
    const from = shownRef.current;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setShown(countUpValue(from, value, elapsed, duration));
      if (elapsed < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  const finalText = format(value);
  return (
    <Text
      {...rest}
      accessibilityLabel={finalText}
      style={[{ fontVariant: ['tabular-nums'] }, style]}
    >
      {format(shown)}
    </Text>
  );
}
