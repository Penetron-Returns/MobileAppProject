import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Mask,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  compileFrames,
  IDENTITY,
  sampleFrames,
  type CompiledFrames,
  type Sampled,
} from './keyframes';
import type { PropKind } from './poses';
import { useLoop } from './useLoop';

/** Props are plain RN views and svg shapes, drawn on the character's 84 pt design box. */

const TWINKLE = compileFrames([
  { at: 0, sx: 0.2, sy: 0.2, rot: 0, op: 0.2 },
  { at: 0.45, sx: 1.1, sy: 1.1, op: 1 },
  { at: 1, sx: 0.2, sy: 0.2, rot: 90, op: 0.2 },
]);
const HEART_PROUD = compileFrames([
  { at: 0, sx: 1, sy: 1 },
  { at: 0.5, sx: 1.25, sy: 1.25 },
  { at: 1, sx: 1, sy: 1 },
]);
const HEART_SOFT = compileFrames([
  { at: 0, sx: 0.7, sy: 0.7 },
  { at: 0.5, sx: 0.9, sy: 0.9 },
  { at: 1, sx: 0.7, sy: 0.7 },
]);
const SIGN_WOBBLE = compileFrames(
  [
    { at: 0, rot: -9 },
    { at: 0.5, rot: 9 },
    { at: 1, rot: -9 },
  ],
  { isLinear: false },
);
const LENS_BOB = compileFrames([
  { at: 0, ty: 0 },
  { at: 0.5, ty: -8 },
  { at: 1, ty: 0 },
]);
const QUESTION = compileFrames([
  { at: 0, ty: 0, rot: -8, op: 0.55 },
  { at: 0.5, ty: -7, rot: 8, op: 1 },
  { at: 1, ty: 0, rot: -8, op: 0.55 },
]);
const DROP = compileFrames([
  { at: 0, tx: 0, ty: 0, op: 0 },
  { at: 0.15, op: 1 },
  { at: 0.8, tx: -2, ty: 20, op: 0 },
  { at: 1, tx: -2, ty: 20, op: 0 },
]);
const CATCH = compileFrames(
  [
    { at: 0, ty: -70, sx: 1, sy: 1, op: 0 },
    { at: 0.12, op: 1 },
    { at: 0.58, ty: 40, sx: 1, sy: 1, op: 1 },
    { at: 0.68, ty: 38, sx: 1.5, sy: 1.5, op: 1 },
    { at: 0.82, ty: 38, sx: 0, sy: 0, op: 0 },
    { at: 1, ty: -70, sx: 1, sy: 1, op: 0 },
  ],
  { isLinear: true },
);
const Z_FLOAT = compileFrames(
  [
    { at: 0, tx: 0, ty: 6, op: 0 },
    { at: 0.3, op: 1 },
    { at: 1, tx: 8, ty: -16, op: 0 },
  ],
  { isLinear: true },
);

const REST: Sampled = IDENTITY;
const HIDDEN: Sampled = { ...IDENTITY, op: 0 };

interface PropLoopProps {
  frames: CompiledFrames;
  durationMs: number;
  delayMs?: number;
  isRunning: boolean;
  /** What it looks like at rest (Reduce Motion, or the character is not active). */
  rest?: Sampled;
  style: ViewStyle;
  origin?: string;
  children: React.ReactNode;
}

function PropLoop({
  frames,
  durationMs,
  delayMs = 0,
  isRunning,
  rest = REST,
  style,
  origin,
  children,
}: PropLoopProps) {
  const t = useLoop(durationMs, isRunning, delayMs);
  const animated = useAnimatedStyle(() => {
    const s = isRunning ? sampleFrames(frames, t.value) : rest;
    return {
      opacity: s.op,
      transform: [
        { translateX: s.tx },
        { translateY: s.ty },
        { rotate: `${s.rot}deg` },
        { scaleX: s.sx },
        { scaleY: s.sy },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        style,
        origin ? { transformOrigin: origin } : null,
        animated,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function Sparkle({
  size,
  left,
  top,
  delayMs,
  durationMs,
  isRunning,
}: {
  size: number;
  left: number;
  top: number;
  delayMs: number;
  durationMs: number;
  isRunning: boolean;
}) {
  return (
    <PropLoop
      frames={TWINKLE}
      durationMs={durationMs}
      delayMs={delayMs}
      isRunning={isRunning}
      style={{ left, top, width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="spk" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF3B0" />
            <Stop offset="1" stopColor="#FFC94D" />
          </LinearGradient>
        </Defs>
        <Polygon
          points="12,0 14.9,9.1 24,12 14.9,14.9 12,24 9.1,14.9 0,12 9.1,9.1"
          fill="url(#spk)"
        />
      </Svg>
    </PropLoop>
  );
}

function Heart({ isSoft, isRunning }: { isSoft: boolean; isRunning: boolean }) {
  return (
    <PropLoop
      frames={isSoft ? HEART_SOFT : HEART_PROUD}
      durationMs={isSoft ? 2400 : 1200}
      isRunning={isRunning}
      rest={isSoft ? { ...REST, sx: 0.8, sy: 0.8 } : REST}
      style={isSoft ? { left: 56, top: -10 } : { left: 30, top: -28 }}
    >
      <Svg width={22} height={20} viewBox="0 0 24 22">
        <Path
          d="M12 21s-8.5-5.3-10.7-10.4A5.6 5.6 0 0 1 12 5.6a5.6 5.6 0 0 1 10.7 5C20.5 15.7 12 21 12 21z"
          fill={isSoft ? '#FFB3AA' : '#FF8A9A'}
        />
      </Svg>
    </PropLoop>
  );
}

function Lens({ isRunning, facing }: { isRunning: boolean; facing: 1 | -1 }) {
  return (
    <PropLoop
      frames={LENS_BOB}
      durationMs={2400}
      isRunning={isRunning}
      style={{ left: facing < 0 ? -14 : 60, top: 26, width: 34, height: 36 }}
    >
      <View style={styles.lensGlass} />
      <View style={styles.lensHandle} />
    </PropLoop>
  );
}

function Sign({ isRunning }: { isRunning: boolean }) {
  return (
    <PropLoop
      frames={SIGN_WOBBLE}
      durationMs={1400}
      isRunning={isRunning}
      style={{ left: 62, top: -36, width: 48, height: 62 }}
      origin="10% 100%"
    >
      <View style={styles.signBoard}>
        <Text style={styles.signText}>NEW</Text>
      </View>
      <View style={styles.signStick} />
    </PropLoop>
  );
}

function Stars({ isRunning }: { isRunning: boolean }) {
  // Falling stars are motion only: there is no resting pose for them.
  const spots = [
    { left: 6, top: -6, delay: 0 },
    { left: 34, top: -14, delay: 450 },
    { left: 60, top: -4, delay: 900 },
  ];
  return (
    <>
      {spots.map((s) => (
        <PropLoop
          key={s.left}
          frames={CATCH}
          durationMs={2400}
          delayMs={s.delay}
          isRunning={isRunning}
          rest={HIDDEN}
          style={{ left: s.left, top: s.top, width: 14, height: 14 }}
        >
          <Svg width={14} height={14} viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="star" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFE58A" />
                <Stop offset="1" stopColor="#FFB020" />
              </LinearGradient>
            </Defs>
            <Polygon
              points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35"
              fill="url(#star)"
            />
          </Svg>
        </PropLoop>
      ))}
    </>
  );
}

function Zs({ isRunning }: { isRunning: boolean }) {
  const zs = [
    { left: 60, top: -4, size: 16, delay: 0 },
    { left: 70, top: -14, size: 20, delay: 1000 },
    { left: 82, top: -26, size: 24, delay: 2000 },
  ];
  return (
    <>
      {zs.map((z) => (
        <PropLoop
          key={z.left}
          frames={Z_FLOAT}
          durationMs={3000}
          delayMs={z.delay}
          isRunning={isRunning}
          style={{ left: z.left, top: z.top }}
        >
          <Text style={[styles.z, { fontSize: z.size, lineHeight: z.size }]}>
            z
          </Text>
        </PropLoop>
      ))}
    </>
  );
}

function Moon() {
  return (
    <View pointerEvents="none" style={[styles.abs, { left: -14, top: -10 }]}>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Defs>
          <Mask id="crescent">
            <Rect width="18" height="18" fill="#fff" />
            <Circle cx="12" cy="6" r="8" fill="#000" />
          </Mask>
        </Defs>
        <Circle cx="9" cy="9" r="9" fill="#FFE9A8" mask="url(#crescent)" />
      </Svg>
    </View>
  );
}

export interface ClovieProps {
  kinds: PropKind[];
  /** Loops run only while true (the character is active and motion is allowed). */
  isRunning: boolean;
  facing: 1 | -1;
}

export function ClovieProps({ kinds, isRunning, facing }: ClovieProps) {
  const has = (k: PropKind) => kinds.includes(k);
  const sparkleMs =
    has('sparkle2') && has('sign')
      ? 1400
      : kinds.includes('heart')
        ? 1600
        : 1200;
  const isDelighted = has('sparkle1') && has('sparkle2');
  const sparkle = (
    k: PropKind,
    p: { size: number; left: number; top: number; delayMs: number },
  ) =>
    has(k) ? (
      <Sparkle key={k} {...p} durationMs={sparkleMs} isRunning={isRunning} />
    ) : null;
  return (
    <>
      {sparkle('sparkle1', { size: 16, left: -10, top: 2, delayMs: 0 })}
      {sparkle('sparkle2', {
        size: 12,
        left: 72,
        top: -8,
        delayMs: isDelighted ? 400 : 0,
      })}
      {sparkle('sparkle3', {
        size: 10,
        left: 70,
        top: 44,
        delayMs: isDelighted ? 800 : 0,
      })}
      {has('sign') ? <Sign isRunning={isRunning} /> : null}
      {has('lens') ? <Lens isRunning={isRunning} facing={facing} /> : null}
      {has('heart') ? (
        <Heart isSoft={!has('sparkle1')} isRunning={isRunning} />
      ) : null}
      {has('question') ? (
        <PropLoop
          frames={QUESTION}
          durationMs={3000}
          isRunning={isRunning}
          style={{ left: 62, top: -30 }}
        >
          <Text style={styles.question}>?</Text>
        </PropLoop>
      ) : null}
      {has('drop') ? (
        <PropLoop
          frames={DROP}
          durationMs={3000}
          isRunning={isRunning}
          style={{ left: -6, top: 6, width: 9, height: 9 }}
        >
          <View style={styles.drop} />
        </PropLoop>
      ) : null}
      {has('stars') ? <Stars isRunning={isRunning} /> : null}
      {has('z') ? <Zs isRunning={isRunning} /> : null}
      {has('moon') ? <Moon /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  lensGlass: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 4,
    borderColor: '#E4F6FF',
    backgroundColor: 'rgba(157,217,245,0.35)',
  },
  lensHandle: {
    position: 'absolute',
    left: 19,
    top: 19,
    width: 5,
    height: 15,
    borderRadius: 3,
    backgroundColor: '#E4F6FF',
    transform: [{ rotate: '-45deg' }],
    transformOrigin: '50% 0%',
  },
  signBoard: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 48,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    // A drop shadow would be re-rendered every frame of the wobble: a flat edge instead.
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(10,26,40,0.22)',
  },
  signText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#0A5F8F',
  },
  signStick: {
    position: 'absolute',
    left: 8,
    top: 24,
    width: 4,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#CFEFFC',
  },
  question: {
    fontSize: 30,
    lineHeight: 30,
    fontWeight: '800',
    color: '#FFC266',
  },
  drop: {
    width: 9,
    height: 9,
    backgroundColor: '#9DD9F5',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    transform: [{ rotate: '-45deg' }],
  },
  z: { fontWeight: '800', color: '#9DD9F5' },
});
