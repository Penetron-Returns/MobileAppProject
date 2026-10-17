import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { cardFill } from './turnPhase';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

interface ProgressBarsProps {
  count: number;
  current: number;
  /** 0..1 fill of the current segment. */
  progress: SharedValue<number>;
  /** The committed card serial: the current segment fills from it to serial + 1. */
  serial: number;
  color: string;
  label: string;
}

function Segment({
  index,
  current,
  progress,
  serial,
  color,
}: {
  index: number;
  current: number;
  progress: SharedValue<number>;
  serial: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const fill =
      index < current
        ? 1
        : index > current
          ? 0
          : cardFill(progress.value, serial);
    return { transform: [{ scaleX: fill }] };
  });
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />
    </View>
  );
}

/** Segmented progress: one bar per card, the current one filling over 5 s. */
export function ProgressBars({
  count,
  current,
  progress,
  serial,
  color,
  label,
}: ProgressBarsProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={styles.row}
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment
          key={i}
          index={i}
          current={current}
          progress={progress}
          serial={serial}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, height: 3 },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  fill: { height: 3, borderRadius: 2, transformOrigin: '0% 50%' },
});
