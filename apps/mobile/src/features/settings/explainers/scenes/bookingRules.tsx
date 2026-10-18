import { Check, X } from 'lucide-react-native';
import { View } from 'react-native';

import { Tween } from '../motion';
import {
  Avatar,
  Box,
  CENTER,
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

/** Earliest booking: the clock hand sweeps an hour and the slots inside it lock grey. */
export function LeadScene({ progress, c, label }: SceneProps) {
  const chip = (x: number, text: string, locksAt: number | null) => (
    <Box x={x} y={50} w={22} h={18} style={{ ...chipStyle(c, 9), ...CENTER }}>
      {locksAt !== null ? (
        <Tween
          progress={progress}
          range={[locksAt, locksAt + 10]}
          from={{ opacity: 0 }}
          style={{
            ...FILL,
            borderRadius: 9,
            backgroundColor: c.grey,
            ...CENTER,
          }}
        >
          <Label size={10} color={c.greyText}>
            {text}
          </Label>
        </Tween>
      ) : (
        <Label size={10} color={c.tint}>
          {text}
        </Label>
      )}
    </Box>
  );
  return (
    <>
      <Box
        x={6}
        y={6}
        w={32}
        h={32}
        style={{ ...chipStyle(c, 16), borderWidth: 2.5, borderColor: c.tint }}
      />
      <Tween
        progress={progress}
        range={[8, 55]}
        from={{ rotate: 0 }}
        to={{ rotate: 360 }}
        style={{ position: 'absolute', left: 21, top: 9, width: 2, height: 26 }}
      >
        <View
          style={{
            width: 2,
            height: 13,
            borderRadius: 1,
            backgroundColor: c.tint,
          }}
        />
      </Tween>
      <Box
        x={19.5}
        y={19.5}
        w={5}
        h={5}
        style={{ borderRadius: 3, backgroundColor: c.tint }}
      />
      <Box x={42} y={14} w={32} h={18} style={{ justifyContent: 'center' }}>
        <Label size={15} color={c.tint} weight="700">
          {label ?? '1 h'}
        </Label>
      </Box>
      {chip(4, '9:00', 14)}
      {chip(27, '9:30', 34)}
      {chip(50, '10:00', null)}
    </>
  );
}

/** Latest booking: a day strip scrolls forward under the limit line. */
export function HorizonScene({ progress, c, label }: SceneProps) {
  return (
    <>
      <Tween
        progress={progress}
        range={[0, 7]}
        from={{ opacity: 0 }}
        style={{ position: 'absolute', left: 4, top: 12 }}
      >
        <Tween
          progress={progress}
          range={[12, 55]}
          from={{ x: 0 }}
          to={{ x: -24 }}
          style={{ flexDirection: 'row', gap: 4 }}
        >
          {[12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => (
            <View
              key={n}
              style={{ width: 20, height: 30, ...chipStyle(c, 8), ...CENTER }}
            >
              <Label size={12} color={c.label}>
                {String(n)}
              </Label>
            </View>
          ))}
        </Tween>
      </Tween>
      <Box
        x={46}
        y={4}
        w={30}
        h={46}
        style={{
          experimental_backgroundImage: `linear-gradient(90deg, transparent, ${c.stageContent} 55%)`,
          opacity: 0.94,
        }}
      />
      <Box
        x={46}
        y={6}
        w={2}
        h={42}
        style={{
          borderLeftWidth: 2,
          borderStyle: 'dashed',
          borderColor: c.tint,
        }}
      />
      <Box x={0} y={56} w={76} h={16} style={CENTER}>
        <Label size={13} color={c.tint}>
          {label ?? '60 days'}
        </Label>
      </Box>
    </>
  );
}

/** Free cancellation: a time dot crosses the limit; the cancel X is allowed before it and locked after. */
export function CancelScene({ progress, c, label }: SceneProps) {
  return (
    <>
      <Box
        x={8}
        y={6}
        w={60}
        h={26}
        style={{ ...chipStyle(c, 9), overflow: 'hidden' }}
      >
        <Box x={0} y={0} w={3} h={26} style={{ backgroundColor: c.tint }} />
        <Box
          x={10}
          y={8}
          w={22}
          h={5}
          style={{ borderRadius: 3, backgroundColor: c.soft2 }}
        />
        <Box
          x={10}
          y={17}
          w={16}
          h={4}
          style={{ borderRadius: 2, backgroundColor: c.grey }}
        />
        <Box
          x={40}
          y={5}
          w={16}
          h={16}
          style={{ borderRadius: 8, backgroundColor: c.grey, ...CENTER }}
        >
          <X size={9} strokeWidth={3.4} color={c.greyText} />
          <Tween
            progress={progress}
            range={[33, 41]}
            from={{ opacity: 1 }}
            to={{ opacity: 0 }}
            style={{
              ...FILL,
              borderRadius: 8,
              backgroundColor: c.tint,
              ...CENTER,
            }}
          >
            <X size={9} strokeWidth={3.4} color="#FFFFFF" />
          </Tween>
        </Box>
      </Box>
      <Box
        x={8}
        y={52}
        w={60}
        h={4}
        style={{ borderRadius: 2, backgroundColor: c.grey }}
      />
      <Tween
        progress={progress}
        range={[8, 60]}
        from={{ width: 4 }}
        to={{ width: 54 }}
        style={{
          position: 'absolute',
          left: 8,
          top: 52,
          height: 4,
          borderRadius: 2,
          backgroundColor: c.tint,
          width: 54,
        }}
      />
      <Box
        x={38}
        y={42}
        w={2}
        h={22}
        style={{
          borderLeftWidth: 2,
          borderStyle: 'dashed',
          borderColor: c.tint,
        }}
      />
      <Tween
        progress={progress}
        range={[8, 60]}
        from={{ left: 6 }}
        to={{ left: 56 }}
        style={{
          position: 'absolute',
          top: 47,
          left: 56,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: c.chip,
          borderWidth: 2.5,
          borderColor: c.tint,
        }}
      />
      <Box x={23} y={62} w={30} h={12} style={CENTER}>
        <Label size={10} color={c.secondary}>
          {label ?? '24 h'}
        </Label>
      </Box>
    </>
  );
}

const SLOT_POS = [
  [4, 8],
  [41, 8],
  [4, 29],
  [41, 29],
  [4, 50],
  [41, 50],
] as const;

/** Six start times from 9:00, `stepMinutes` apart. */
export function slotTimes(stepMinutes: number): string[] {
  return SLOT_POS.map((_, i) => {
    const t = 540 + i * stepMinutes;
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  });
}

/** Gap between start times: slot chips pop in one by one, spaced by the chosen step. */
export function IntervalScene({ progress, c, stepMinutes = 15 }: SceneProps) {
  const times = slotTimes(stepMinutes);
  return (
    <>
      {SLOT_POS.map(([x, y], i) => (
        <Tween
          key={`${x}-${y}`}
          progress={progress}
          range={[3 + i * 10, 12 + i * 10]}
          from={{ opacity: 0, scale: 0.6 }}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: 31,
            height: 17,
            ...chipStyle(c, 9),
            ...CENTER,
          }}
        >
          <Label size={11} color={c.tint}>
            {times[i]}
          </Label>
        </Tween>
      ))}
    </>
  );
}

/** Break between appointments: the second block slides down and a dashed gap opens. */
export function BufferScene({ progress, c, label }: SceneProps) {
  return (
    <>
      <Box
        x={10}
        y={8}
        w={56}
        h={22}
        style={{ borderRadius: 8, backgroundColor: c.tint }}
      >
        <Box
          x={10}
          y={8}
          w={26}
          h={5}
          style={{ borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.75)' }}
        />
      </Box>
      <Tween
        progress={progress}
        range={[12, 40]}
        from={{ opacity: 0, height: 0 }}
        to={{ opacity: 1, height: 14 }}
        style={{
          position: 'absolute',
          left: 10,
          top: 30,
          width: 56,
          height: 14,
          overflow: 'hidden',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: c.tint,
          borderRadius: 6,
          backgroundColor: c.soft,
          ...CENTER,
        }}
      >
        <Label size={10} color={c.tint} weight="700">
          {label ?? '10 min'}
        </Label>
      </Tween>
      <Tween
        progress={progress}
        range={[12, 40]}
        from={{ top: 32 }}
        to={{ top: 44 }}
        style={{
          position: 'absolute',
          left: 10,
          top: 44,
          width: 56,
          height: 22,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: c.soft2,
        }}
      >
        <Box x={0} y={0} w={3} h={22} style={{ backgroundColor: c.tint }} />
        <Box
          x={10}
          y={8}
          w={22}
          h={5}
          style={{ borderRadius: 3, backgroundColor: c.tint, opacity: 0.6 }}
        />
      </Tween>
    </>
  );
}

/** Clients can choose who: a tap selects the second team member. */
export function StaffScene({ progress, c, words }: SceneProps) {
  return (
    <>
      <Avatar x={8} y={10} size={28} color="#0A69DB" initials="TM" />
      <Avatar x={40} y={10} size={28} color="#1F8A4C" initials="NK" />
      <Tween
        progress={progress}
        range={[42, 51]}
        from={{ opacity: 0, scale: 0.7 }}
        style={{
          position: 'absolute',
          left: 37,
          top: 7,
          width: 34,
          height: 34,
          borderRadius: 17,
          borderWidth: 2.5,
          borderColor: c.tint,
        }}
      />
      <Tween
        progress={progress}
        range={[46, 55]}
        from={{ opacity: 0, scale: 0.4 }}
        style={{
          position: 'absolute',
          left: 56,
          top: 30,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: c.tint,
          borderWidth: 1.5,
          borderColor: c.chip,
          ...CENTER,
        }}
      >
        <Check size={9} strokeWidth={3.2} color="#FFFFFF" />
      </Tween>
      <Box x={6} y={54} w={64} h={17} style={{ ...chipStyle(c, 8), ...CENTER }}>
        <Label size={11} color={c.tint}>
          Nomsa
        </Label>
      </Box>
      <Tween
        progress={progress}
        range={[44, 50]}
        from={{ opacity: 1 }}
        to={{ opacity: 0 }}
        style={{
          position: 'absolute',
          left: 6,
          top: 54,
          width: 64,
          height: 17,
          ...chipStyle(c, 8),
          ...CENTER,
        }}
      >
        <Label size={11} color={c.greyText}>
          {words.anyone}
        </Label>
      </Tween>
      <Tween
        progress={progress}
        range={[0, 14]}
        from={{ opacity: 0, x: 10, y: 36 }}
        style={{ position: 'absolute', left: 48, top: 30 }}
      >
        <Tween
          progress={progress}
          range={[48, 58]}
          from={{ opacity: 1 }}
          to={{ opacity: 0 }}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: 'rgba(60,60,67,0.35)',
            borderWidth: 2,
            borderColor: '#FFFFFF',
          }}
        />
      </Tween>
    </>
  );
}
