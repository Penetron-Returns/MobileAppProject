import * as React from 'react';
import {
  Image,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { type SharedValue } from 'react-native-reanimated';

import { type StagePalette } from '../palette';

const COMPANION = require('@/assets/images/companion-120.png');

/** What every scene receives: the run, the colours and the few live values. */
export interface SceneProps {
  progress: SharedValue<number>;
  c: StagePalette;
  /** The row's live value as a short label ("1 h", "60 days", "10 min"). */
  label?: string;
  /** Minutes between start times (the interval scene). */
  stepMinutes?: number;
  /** Words the scenes draw ("Anyone", "DEC", "CLOSED"). */
  words: SceneWords;
}

export interface SceneWords {
  anyone: string;
  month: string;
  closed: string;
}

export const CENTER: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

/** A box placed on the 76pt stage, in the canvas's own coordinates. */
export function boxStyle(
  x: number,
  y: number,
  w: number,
  h: number,
  extra?: ViewStyle,
): ViewStyle {
  return {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: h,
    ...extra,
  };
}

export function chipStyle(c: StagePalette, radius: number): ViewStyle {
  return {
    borderRadius: radius,
    backgroundColor: c.chip,
    boxShadow: c.chipShadow,
  };
}

export function Box({
  x,
  y,
  w,
  h,
  style,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  return <View style={boxStyle(x, y, w, h, style)}>{children}</View>;
}

/** Stage text: never scales with the system font size, it is a picture. */
export function Label({
  children,
  size,
  color,
  weight = '600',
  style,
}: {
  children: React.ReactNode;
  size: number;
  color: string;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        {
          fontSize: size,
          fontWeight: weight,
          color,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The companion art. Never given eyes or lids: it is drawn as shipped. */
export function ClovieArt({
  x,
  y,
  size,
  style,
}: {
  x: number;
  y: number;
  size: number;
  style?: object;
}) {
  return (
    <Image
      source={COMPANION}
      resizeMode="contain"
      style={[boxStyle(x, y, size, size), style]}
    />
  );
}

export function Avatar({
  x,
  y,
  size,
  color,
  initials,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  initials: string;
}) {
  return (
    <Box
      x={x}
      y={y}
      w={size}
      h={size}
      style={{ borderRadius: size / 2, backgroundColor: color, ...CENTER }}
    >
      <Label size={Math.round(size * 0.42)} color="#FFFFFF" weight="700">
        {initials}
      </Label>
    </Box>
  );
}

/** Diagonal closed-day hatch (the canvas's repeating 45 degree gradient), clipped to its box. */
export const Hatch = React.memo(function Hatch({
  w,
  h,
  color,
}: {
  w: number;
  h: number;
  color: string;
}) {
  const count = Math.ceil((w + h) / 4);
  const lines = Array.from({ length: count }, (_, k) => k);
  return (
    <View
      style={{ width: w, height: h, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {lines.map((k) => (
        <View
          key={k}
          style={{
            position: 'absolute',
            left: 4 * k - 120,
            top: h - 4 * k - 0.7,
            width: 240,
            height: 1.4,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
});
