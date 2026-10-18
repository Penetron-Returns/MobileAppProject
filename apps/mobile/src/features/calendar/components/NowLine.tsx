import { Text, useDepth } from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';

import { useNow } from '@/hooks/useNow';
import { minutesToTime, type ISODate } from '@/lib/time';

import { minutesToPx, nowMinute, type MinuteSpan } from '../logic';

interface NowProps {
  date: ISODate;
  timezone: string;
  window: MinuteSpan;
}

/** Minutes since midnight for the now line, or null when it is not on this day's grid. */
function useNowMinute({ date, timezone, window }: NowProps): number | null {
  const now = useNow();
  return nowMinute(now, timezone, date, window);
}

/**
 * The red line across the columns. It owns the 30s clock, so a tick re-renders
 * these few views and never the grid.
 */
export const NowLine = React.memo(function NowLine(props: NowProps) {
  const depth = useDepth();
  const minute = useNowMinute(props);
  if (minute === null) return null;
  const top = minutesToPx(minute - props.window.startMin);
  return (
    <>
      <View
        pointerEvents="none"
        style={{ top, backgroundColor: depth.colors.red }}
        className="absolute left-0 right-0 h-0.5"
      />
      <View
        pointerEvents="none"
        style={{ top: top - 4, backgroundColor: depth.colors.red }}
        className="absolute left-px h-2.5 w-2.5 rounded-full"
      />
    </>
  );
});

/** The current time pill in the gutter, on the same line. */
export const NowLabel = React.memo(function NowLabel(props: NowProps) {
  const depth = useDepth();
  const minute = useNowMinute(props);
  if (minute === null) return null;
  return (
    <Text
      style={{
        position: 'absolute',
        right: 6,
        top: minutesToPx(minute - props.window.startMin) - 9,
        color: depth.colors.onFill,
        backgroundColor: depth.colors.red,
        fontVariant: ['tabular-nums'],
      }}
      className="overflow-hidden rounded-md px-1 text-meta font-semibold"
    >
      {minutesToTime(minute)}
    </Text>
  );
});
