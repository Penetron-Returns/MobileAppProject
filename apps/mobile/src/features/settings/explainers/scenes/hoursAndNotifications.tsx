import { Bell, Clock } from 'lucide-react-native';
import * as React from 'react';

import { Tween } from '../motion';
import { Box, CENTER, chipStyle, Hatch, Label, type SceneProps } from './parts';

const FILL = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
} as const;
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const IS_OPEN = [false, true, true, true, true, true, false];

/** Opening hours: Tuesday to Saturday light up and the open bar fills. */
export function WeekScene({ progress, c }: SceneProps) {
  return (
    <>
      {WEEK_LETTERS.map((letter, i) => {
        const x = 3 + i * 10.5;
        const start = 6 + i * 6;
        return (
          <React.Fragment key={`${letter}-${x}`}>
            <Box
              x={x}
              y={10}
              w={8}
              h={30}
              style={{
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: IS_OPEN[i] ? c.tint : c.grey,
              }}
            >
              {IS_OPEN[i] ? (
                <Tween
                  progress={progress}
                  range={[start, start + 8]}
                  from={{ opacity: 1 }}
                  to={{ opacity: 0 }}
                  style={{ ...FILL, backgroundColor: c.grey }}
                />
              ) : (
                <Hatch w={8} h={30} color={c.hatch} />
              )}
            </Box>
            <Box x={x - 1} y={43} w={10} h={12} style={CENTER}>
              <Label size={9} color={c.secondary}>
                {letter}
              </Label>
            </Box>
          </React.Fragment>
        );
      })}
      <Box
        x={6}
        y={60}
        w={64}
        h={8}
        style={{
          borderRadius: 4,
          backgroundColor: c.inset,
          overflow: 'hidden',
        }}
      >
        <Tween
          progress={progress}
          range={[28, 55]}
          from={{ width: 0 }}
          to={{ width: 40 }}
          style={{
            position: 'absolute',
            left: 10,
            top: 0,
            height: 8,
            width: 40,
            borderRadius: 4,
            backgroundColor: c.tint,
          }}
        />
      </Box>
    </>
  );
}

/** Holidays: a calendar date gets a CLOSED stripe. */
export function HolidayScene({ progress, c, words }: SceneProps) {
  return (
    <Box
      x={14}
      y={8}
      w={48}
      h={56}
      style={{ ...chipStyle(c, 10), overflow: 'hidden' }}
    >
      <Box
        x={0}
        y={0}
        w={48}
        h={15}
        style={{ backgroundColor: c.tint, ...CENTER }}
      >
        <Label size={10} color="#FFFFFF" weight="700">
          {words.month}
        </Label>
      </Box>
      <Box x={0} y={16} w={48} h={28} style={CENTER}>
        <Label size={24} color={c.label} weight="700">
          16
        </Label>
      </Box>
      <Tween
        progress={progress}
        range={[34, 50]}
        from={{ opacity: 0 }}
        style={{
          position: 'absolute',
          left: 0,
          top: 15,
          width: 48,
          height: 41,
        }}
      >
        <Hatch w={48} h={41} color={c.hatch} />
      </Tween>
      <Tween
        progress={progress}
        range={[28, 46]}
        from={{ width: 0 }}
        to={{ width: 62 }}
        style={{
          position: 'absolute',
          left: -6,
          top: 36,
          width: 62,
          height: 15,
          overflow: 'hidden',
          backgroundColor: c.red,
          transform: [{ rotate: '-14deg' }],
          transformOrigin: 'left center',
          ...CENTER,
        }}
      >
        <Label size={9} color="#FFFFFF" weight="700">
          {words.closed}
        </Label>
      </Tween>
    </Box>
  );
}

/** Push: notification cards slide onto a lock screen. */
export function PushScene({ progress, c }: SceneProps) {
  const card = (y: number, at: number) => (
    <Tween
      progress={progress}
      range={[at, at + 9]}
      from={{ opacity: 0, y: -14 }}
      style={{
        position: 'absolute',
        left: 3,
        top: y,
        width: 33,
        height: 15,
        borderRadius: 5,
        backgroundColor: 'rgba(255,255,255,0.93)',
      }}
    >
      <Box
        x={3}
        y={3}
        w={9}
        h={9}
        style={{ borderRadius: 3, backgroundColor: c.tint }}
      />
      <Box
        x={15}
        y={3.5}
        w={16}
        h={3}
        style={{ borderRadius: 2, backgroundColor: '#5b6475' }}
      />
      <Box
        x={15}
        y={9}
        w={11}
        h={3}
        style={{ borderRadius: 2, backgroundColor: '#aab1bf' }}
      />
    </Tween>
  );
  return (
    <Box
      x={16}
      y={6}
      w={44}
      h={70}
      style={{
        borderRadius: 11,
        backgroundColor: '#0E1626',
        boxShadow: '0 4px 10px -3px rgba(16,24,40,0.4)',
      }}
    >
      <Box
        x={2.5}
        y={2.5}
        w={39}
        h={65}
        style={{
          borderRadius: 9,
          overflow: 'hidden',
          experimental_backgroundImage:
            'linear-gradient(180deg, #2C4F86, #162A4D)',
          backgroundColor: '#2C4F86',
        }}
      >
        <Box x={0} y={8} w={39} h={16} style={CENTER}>
          <Label size={13} color="#FFFFFF">
            9:41
          </Label>
        </Box>
        {card(30, 12)}
        {card(49, 36)}
        <Tween
          progress={progress}
          range={[6, 16]}
          from={{ opacity: 0.75 }}
          to={{ opacity: 0 }}
          style={{ ...FILL, backgroundColor: '#0E1626' }}
        />
      </Box>
    </Box>
  );
}

/** Reminders to clients: a WhatsApp reminder lands the chosen time before the booking. */
export function RemindScene({ progress, c, label }: SceneProps) {
  return (
    <>
      <Tween
        progress={progress}
        range={[3, 12]}
        from={{ opacity: 0, scale: 0.8 }}
        style={{
          position: 'absolute',
          left: 8,
          top: 7,
          width: 60,
          height: 20,
          borderRadius: 10,
          backgroundColor: c.soft,
          flexDirection: 'row',
          gap: 4,
          ...CENTER,
        }}
      >
        <Clock size={11} strokeWidth={2.6} color={c.tint} />
        <Label size={11} color={c.tint} weight="700">
          {label ?? '1 day'}
        </Label>
      </Tween>
      <Tween
        progress={progress}
        range={[30, 39]}
        from={{ opacity: 0, y: 10 }}
        style={{
          position: 'absolute',
          left: 8,
          top: 36,
          width: 60,
          height: 32,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 4,
          backgroundColor: c.bubbleOut,
          boxShadow: '0 1px 1px rgba(16,24,40,0.12)',
        }}
      >
        <Box
          x={8}
          y={7}
          w={16}
          h={16}
          style={{
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.6)',
            ...CENTER,
          }}
        >
          <Bell size={14} strokeWidth={2.4} color="#1B7F38" />
        </Box>
        <Box
          x={30}
          y={9}
          w={22}
          h={4}
          style={{ borderRadius: 2, backgroundColor: '#5b6b5b', opacity: 0.7 }}
        />
        <Box
          x={30}
          y={17}
          w={15}
          h={4}
          style={{ borderRadius: 2, backgroundColor: '#5b6b5b', opacity: 0.4 }}
        />
      </Tween>
    </>
  );
}
