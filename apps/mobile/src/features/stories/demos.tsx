import { useReduceMotion } from '@booking/ui';
import {
  compileFrames,
  IDENTITY,
  useLoop,
  type Sampled,
} from '@/features/clovie-character';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Glass } from './cardVisuals';
import { FramedView } from './FramedView';
import { barScale, EASE_POP, EASE_SPRING } from './motion';
import { useReveal } from './useReveal';

/**
 * The two product demo mini-animations, copied from the board. Each loops only
 * while its card is the one on screen (they are mounted by the current face
 * only) and not at all with Reduce Motion, which shows a still frame.
 */

const CYCLE_MS = 7000;
const ACCENT = '#6FE3BC';

const CARD = compileFrames([
  { at: 0, op: 0, tx: 70 },
  { at: 0.1, op: 1, tx: 0 },
  { at: 0.58, op: 1, tx: 0 },
  { at: 0.7, op: 0, tx: 96 },
  { at: 1, op: 0, tx: 96 },
]);
const BARS = compileFrames(
  [
    { at: 0, op: 0 },
    { at: 0.34, op: 0 },
    { at: 0.4, op: 1 },
    { at: 0.58, op: 1 },
    { at: 0.64, op: 0 },
    { at: 1, op: 0 },
  ],
  { isLinear: true },
);
const SAY = compileFrames([
  { at: 0, op: 0, ty: 6 },
  { at: 0.4, op: 0, ty: 6 },
  { at: 0.46, op: 1, ty: 0 },
  { at: 0.6, op: 1, ty: 0 },
  { at: 0.66, op: 0, ty: -4 },
  { at: 1, op: 0, ty: -4 },
]);
const BOOKED = compileFrames(
  [
    { at: 0, op: 0 },
    { at: 0.1, op: 0 },
    { at: 0.14, op: 1 },
    { at: 0.56, op: 1 },
    { at: 0.62, op: 0 },
    { at: 1, op: 0 },
  ],
  { isLinear: true },
);
const UNDONE = compileFrames([
  { at: 0, op: 0, sx: 0.8, sy: 0.8 },
  { at: 0.68, op: 0, sx: 0.8, sy: 0.8 },
  { at: 0.74, op: 1, sx: 1, sy: 1 },
  { at: 0.94, op: 1, sx: 1, sy: 1 },
  { at: 1, op: 0, sx: 1, sy: 1 },
]);
const TIMER = compileFrames(
  [
    { at: 0, op: 0, sx: 1 },
    { at: 0.1, op: 0, sx: 1 },
    { at: 0.14, op: 1, sx: 1 },
    { at: 0.58, op: 1, sx: 0.28 },
    { at: 0.64, op: 0, sx: 0.28 },
    { at: 1, op: 0, sx: 0.28 },
  ],
  { isLinear: true },
);

const BAR_HEIGHT = [12, 23, 34, 19, 30, 15, 26, 37, 22, 33, 18, 29, 14, 25, 36];
const BAR_SECONDS = [0.4, 0.56, 0.72, 0.48, 0.64];
const BAR_DELAY = [0, 0.3, 0.6, 0.2, 0.5, 0.1, 0.4];

function Bar({
  t,
  index,
  isRunning,
}: {
  t: SharedValue<number>;
  index: number;
  isRunning: boolean;
}) {
  const dur = BAR_SECONDS[index % BAR_SECONDS.length] * 1000;
  const delay = BAR_DELAY[index % BAR_DELAY.length] * 1000;
  const animated = useAnimatedStyle(() => ({
    transform: [
      { scaleY: isRunning ? barScale(t.value * CYCLE_MS, dur, delay) : 0.65 },
    ],
  }));
  return (
    <Animated.View
      style={[styles.bar, { height: BAR_HEIGHT[index] }, animated]}
    >
      <LinearGradient
        colors={['#9DD9F5', '#2AA1D6']}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const rest = (o: Partial<Sampled>): Sampled => ({ ...IDENTITY, ...o });

/** Voice "undo": a tiny waveform, then the booking card slides back. */
export function UndoDemo({ isRunning }: { isRunning: boolean }) {
  const { t: tr } = useTranslation();
  const isReduced = useReduceMotion();
  const live = isRunning && !isReduced;
  const t = useLoop(CYCLE_MS, live, 500);
  return (
    <View accessibilityElementsHidden style={styles.undo}>
      <View style={styles.undoTop}>
        <Glass style={styles.mic}>
          <View style={styles.micCentre}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M6 11.5a6 6 0 0 0 12 0 M12 17.5V21"
                fill="none"
                stroke="#9DD9F5"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        </Glass>
        <FramedView
          t={t}
          frames={BARS}
          isRunning={live}
          rest={rest({ op: 0 })}
          style={styles.bars}
        >
          {BAR_HEIGHT.map((h, i) => (
            <Bar key={h * 100 + i} t={t} index={i} isRunning={live} />
          ))}
        </FramedView>
        <FramedView t={t} frames={SAY} isRunning={live} rest={rest({ op: 0 })}>
          <Glass style={styles.say}>
            <Text style={styles.sayText}>{tr('stories.demo.undoSay')}</Text>
          </Glass>
        </FramedView>
      </View>
      <View style={styles.dashed} />
      <FramedView
        t={t}
        frames={UNDONE}
        isRunning={live}
        rest={rest({ op: 0 })}
        style={styles.undone}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke={ACCENT}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.undoneText}>{tr('stories.demo.undone')}</Text>
      </FramedView>
      <FramedView
        t={t}
        frames={CARD}
        isRunning={live}
        rest={rest({})}
        style={styles.cardSlot}
      >
        <Glass style={styles.bookingCard}>
          <View style={styles.bookingTop}>
            <Text style={styles.bookingName}>
              {tr('stories.demo.undoClient')}
            </Text>
            <FramedView
              t={t}
              frames={BOOKED}
              isRunning={live}
              rest={rest({})}
              style={styles.booked}
            >
              <Text style={styles.bookedText}>{tr('stories.demo.booked')}</Text>
            </FramedView>
          </View>
          <Text style={styles.bookingSub}>
            {tr('stories.demo.undoService')}
          </Text>
          <View style={styles.track}>
            <FramedView
              t={t}
              frames={TIMER}
              isRunning={live}
              rest={rest({ sx: 0.5 })}
              origin="0% 50%"
              style={styles.fill}
            />
          </View>
        </Glass>
      </FramedView>
      <Text style={styles.note}>{tr('stories.demo.undoNote')}</Text>
    </View>
  );
}

const HI_MS = 6000;
/** The chip swells 3% and brightens while Clovie points at it. */
function highlight(from: number, to: number) {
  const at = [0, from - 0.1, from, to, to + 0.12, 1];
  const swell = [1, 1, 1.03, 1.03, 1, 1];
  const glow = [0, 0, 0.14, 0.14, 0, 0];
  return {
    scale: compileFrames(
      at.map((a, i) => ({ at: a, sx: swell[i], sy: swell[i] })),
    ),
    glow: compileFrames(at.map((a, i) => ({ at: a, op: glow[i] }))),
  };
}
const HI_ONE = highlight(0.2, 0.4);
const HI_TWO = highlight(0.68, 0.9);

function Chip({
  initials,
  name,
  sub,
  top,
  gradient,
  enterDelay,
  hi,
  t,
  isRunning,
}: {
  initials: string;
  name: string;
  sub: string;
  top: number;
  gradient: [string, string];
  enterDelay: number;
  hi: typeof HI_ONE;
  t: SharedValue<number>;
  isRunning: boolean;
}) {
  const p = useReveal(enterDelay, 500, EASE_SPRING, !isRunning);
  const enter = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: -30 * (1 - p.value) }],
  }));
  return (
    <Animated.View style={[styles.chipSlot, { top }, enter]}>
      <FramedView
        t={t}
        frames={hi.scale}
        isRunning={isRunning}
        rest={rest({})}
        style={styles.chipScale}
      >
        <Glass style={styles.chip}>
          <FramedView
            t={t}
            frames={hi.glow}
            isRunning={isRunning}
            rest={rest({ op: 0 })}
            style={styles.glow}
          />
          <View style={styles.chipAvatar}>
            <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
            <Text style={styles.chipInitials}>{initials}</Text>
          </View>
          <View>
            <Text style={styles.chipName}>{name}</Text>
            <Text style={styles.chipSub}>{sub}</Text>
          </View>
        </Glass>
      </FramedView>
    </Animated.View>
  );
}

/** Two Thandis: Clovie asks which one. */
export function NamesDemo({ isRunning }: { isRunning: boolean }) {
  const { t: tr } = useTranslation();
  const isReduced = useReduceMotion();
  const live = isRunning && !isReduced;
  const t = useLoop(HI_MS, live, 1400);
  const pop = useReveal(900, 450, EASE_POP, !live);
  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.4 + 0.6 * pop.value }],
  }));
  return (
    <View accessibilityElementsHidden style={styles.names}>
      <Chip
        initials="TM"
        name={tr('stories.demo.thandiA')}
        sub={tr('stories.demo.thandiASub')}
        top={36}
        gradient={['#1E9E7A', '#0F6650']}
        enterDelay={300}
        hi={HI_ONE}
        t={t}
        isRunning={live}
      />
      <Chip
        initials="TD"
        name={tr('stories.demo.thandiB')}
        sub={tr('stories.demo.thandiBSub')}
        top={112}
        gradient={['#1B9494', '#0F6666']}
        enterDelay={450}
        hi={HI_TWO}
        t={t}
        isRunning={live}
      />
      <Animated.View style={[styles.which, popStyle]}>
        <Text style={styles.whichText}>{tr('stories.demo.whichOne')}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  undo: { height: 252 },
  undoTop: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mic: { width: 44, height: 44, borderRadius: 22 },
  micCentre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bars: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: { width: 4, borderRadius: 2, overflow: 'hidden' },
  say: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 18 },
  sayText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dashed: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 80,
    height: 96,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  undone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 80,
    height: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  undoneText: { fontSize: 17, fontWeight: '600', color: ACCENT },
  cardSlot: { position: 'absolute', left: 0, right: 0, top: 80, height: 96 },
  bookingCard: { height: 96, paddingVertical: 12, paddingHorizontal: 18 },
  bookingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookingName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  booked: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(111,227,188,0.2)',
  },
  bookedText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: ACCENT,
  },
  bookingSub: {
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
  },
  track: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: ACCENT },
  note: {
    position: 'absolute',
    left: 0,
    top: 190,
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.62)',
  },
  names: { height: 250 },
  chipSlot: { position: 'absolute', left: 0, width: 252, height: 64 },
  glow: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFF' },
  chipScale: { width: 252, height: 64 },
  chip: {
    width: 252,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInitials: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  chipName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chipSub: {
    fontSize: 14,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.72)',
  },
  which: {
    position: 'absolute',
    left: 232,
    top: -8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  whichText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#0A5F8F',
  },
});
