import { Check, Mic, Undo2, X } from 'lucide-react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { segment, Tween } from '../motion';
import {
  Avatar,
  Box,
  CENTER,
  ClovieArt,
  chipStyle,
  Label,
  type SceneProps,
} from './parts';

const FILL = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
} as const;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Clovie status: a paused (grey) Clovie wakes up as the switch flips to live. */
export function StatusScene({ progress, c }: SceneProps) {
  return (
    <>
      <Tween
        progress={progress}
        range={[30, 39]}
        from={{ opacity: 0, scale: 0.7 }}
        style={{
          position: 'absolute',
          left: 14,
          top: 4,
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: c.soft2,
        }}
      />
      <ClovieArt x={14} y={4} size={48} />
      <Tween
        progress={progress}
        range={[10, 34]}
        from={{ opacity: 1 }}
        to={{ opacity: 0 }}
        style={{
          position: 'absolute',
          left: 14,
          top: 4,
          width: 48,
          height: 48,
        }}
      >
        <ClovieArt
          x={0}
          y={0}
          size={48}
          style={{ filter: [{ grayscale: 1 }], opacity: 0.5 }}
        />
      </Tween>
      <Box
        x={16}
        y={56}
        w={44}
        h={18}
        style={{ borderRadius: 9, backgroundColor: c.green }}
      >
        <Tween
          progress={progress}
          range={[10, 34]}
          from={{ opacity: 1 }}
          to={{ opacity: 0 }}
          style={{ ...FILL, borderRadius: 9, backgroundColor: c.grey }}
        />
        <Tween
          progress={progress}
          range={[10, 34]}
          from={{ left: 2 }}
          to={{ left: 28 }}
          style={{
            position: 'absolute',
            top: 2,
            left: 28,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: '#FFFFFF',
            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}
        />
      </Box>
    </>
  );
}

/** Ask me first: a booking request waits, the owner taps approve and it turns booked. */
export function AskScene({ progress, c }: SceneProps) {
  return (
    <>
      <Box x={6} y={7} w={64} h={30} style={chipStyle(c, 10)}>
        <ClovieArt x={6} y={6} size={18} />
        <Box
          x={30}
          y={8}
          w={28}
          h={5}
          style={{ borderRadius: 3, backgroundColor: c.soft2 }}
        />
        <Box
          x={30}
          y={18}
          w={20}
          h={5}
          style={{ borderRadius: 3, backgroundColor: c.grey }}
        />
      </Box>
      <Tween
        progress={progress}
        range={[48, 57]}
        from={{ opacity: 0, scale: 0.4 }}
        style={{
          position: 'absolute',
          left: 56,
          top: 0,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: c.green,
          borderWidth: 2,
          borderColor: c.stageContent,
          ...CENTER,
        }}
      >
        <Check size={9} strokeWidth={3.2} color="#FFFFFF" />
      </Tween>
      <Box
        x={10}
        y={46}
        w={26}
        h={24}
        style={{ borderRadius: 12, backgroundColor: c.grey, ...CENTER }}
      >
        <X size={10} strokeWidth={3.4} color={c.greyText} />
      </Box>
      <Box
        x={40}
        y={46}
        w={26}
        h={24}
        style={{ borderRadius: 12, backgroundColor: c.tint }}
      >
        <Tween
          progress={progress}
          range={[44, 52]}
          from={{ opacity: 0 }}
          style={{ ...FILL, borderRadius: 12, backgroundColor: c.green }}
        />
        <Box x={0} y={0} w={26} h={24} style={CENTER}>
          <Check size={13} strokeWidth={3.2} color="#FFFFFF" />
        </Box>
      </Box>
    </>
  );
}

const RING = 2 * Math.PI * 18;

/** Time to undo: a countdown ring drains, the undo arrow spins back. */
export function UndoScene({ progress, c, label }: SceneProps) {
  const ring = useAnimatedProps(() => ({
    strokeDashoffset: 40 * segment(progress.value, 6, 68),
  }));
  return (
    <>
      <Svg
        width={44}
        height={44}
        viewBox="0 0 44 44"
        style={{ position: 'absolute', left: 16, top: 4 }}
      >
        <Circle
          cx={22}
          cy={22}
          r={18}
          fill="none"
          stroke={c.grey}
          strokeWidth={4}
        />
        <AnimatedCircle
          cx={22}
          cy={22}
          r={18}
          fill="none"
          stroke={c.tint}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={40}
          animatedProps={ring}
          transform="rotate(-90 22 22)"
        />
      </Svg>
      <Tween
        progress={progress}
        range={[58, 72]}
        from={{ rotate: 0 }}
        to={{ rotate: -360 }}
        style={{
          position: 'absolute',
          left: 30,
          top: 18,
          width: 16,
          height: 16,
        }}
      >
        <Undo2 size={16} strokeWidth={2.6} color={c.tint} />
      </Tween>
      <Box x={0} y={54} w={76} h={18} style={CENTER}>
        <Label size={13} color={c.secondary}>
          {label ?? '30 s'}
        </Label>
      </Box>
    </>
  );
}

/** Who confirms attendance: an avatar asks "came?" and the booking gets its tick. */
export function AttendanceScene({ progress, c }: SceneProps) {
  return (
    <>
      <Box
        x={8}
        y={8}
        w={60}
        h={24}
        style={{ ...chipStyle(c, 9), overflow: 'hidden' }}
      >
        <Box x={0} y={0} w={3} h={24} style={{ backgroundColor: c.tint }} />
        <Box
          x={10}
          y={7}
          w={24}
          h={5}
          style={{ borderRadius: 3, backgroundColor: c.soft2 }}
        />
        <Box
          x={10}
          y={15}
          w={16}
          h={4}
          style={{ borderRadius: 2, backgroundColor: c.grey }}
        />
      </Box>
      <Tween
        progress={progress}
        range={[52, 61]}
        from={{ opacity: 0, scale: 0.4 }}
        style={{
          position: 'absolute',
          left: 54,
          top: 0,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: c.green,
          borderWidth: 2,
          borderColor: c.stageContent,
          ...CENTER,
        }}
      >
        <Check size={9} strokeWidth={3.2} color="#FFFFFF" />
      </Tween>
      <Tween
        progress={progress}
        range={[8, 17]}
        from={{ opacity: 0, scale: 0.6 }}
        style={{
          position: 'absolute',
          left: 10,
          top: 44,
          width: 24,
          height: 24,
        }}
      >
        <Avatar x={0} y={0} size={24} color="#0A69DB" initials="TM" />
      </Tween>
      <Box
        x={40}
        y={44}
        w={30}
        h={24}
        style={{
          ...chipStyle(c, 12),
          borderBottomLeftRadius: 4,
          ...CENTER,
        }}
      >
        <Tween
          progress={progress}
          range={[50, 58]}
          from={{ opacity: 0 }}
          style={{ ...FILL, ...CENTER }}
        >
          <Check size={13} strokeWidth={3.2} color={c.greenText} />
        </Tween>
        <Tween
          progress={progress}
          range={[50, 58]}
          from={{ opacity: 1 }}
          to={{ opacity: 0 }}
          style={{ ...FILL, ...CENTER }}
        >
          <Label size={15} color={c.secondary} weight="700">
            ?
          </Label>
        </Tween>
      </Box>
    </>
  );
}

/** Hey Clovie voice: sound rings out of the mic once. */
export function VoiceScene({ progress, c }: SceneProps) {
  const rings: [number, number][] = [
    [1.4, 0.3],
    [1.9, 0.15],
    [2.3, 0.08],
  ];
  return (
    <>
      {rings.map(([scale, opacity], i) => (
        <Tween
          key={scale}
          progress={progress}
          range={[i * 8, 30 + i * 8]}
          from={{ opacity: 0, scale: 1 }}
          to={{ opacity, scale }}
          style={{
            position: 'absolute',
            left: 22,
            top: 22,
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: c.tint,
          }}
        />
      ))}
      {[5, 11, 60, 66].map((x, i) => (
        <Tween
          key={x}
          progress={progress}
          range={[i * 4, 24 + i * 4]}
          from={{ scaleY: 0.4 }}
          style={{
            position: 'absolute',
            left: x,
            top: 29,
            width: 3,
            height: 18,
            borderRadius: 2,
            backgroundColor: c.tint,
            opacity: 0.7,
          }}
        />
      ))}
      <Box
        x={22}
        y={22}
        w={32}
        h={32}
        style={{
          borderRadius: 16,
          backgroundColor: c.tint,
          boxShadow: '0 3px 8px -2px rgba(10,105,219,0.5)',
          ...CENTER,
        }}
      >
        <Mic size={17} strokeWidth={2.2} color="#FFFFFF" />
      </Box>
    </>
  );
}
