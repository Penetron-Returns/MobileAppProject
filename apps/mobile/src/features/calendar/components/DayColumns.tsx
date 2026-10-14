import { Text, useDepth, withAlpha } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  appointmentSpan,
  complementSpans,
  minutesToPx,
  type MinuteSpan,
} from '../logic';
import { AppointmentBlock } from './AppointmentBlock';
import { Hatch } from './Hatch';
import type { CalendarDayView } from '../hooks';

export const MIN_BLOCK = 36;
export type Ready = Extract<CalendarDayView, { status: 'ready' }>;

export function HourLines({
  hours,
  window,
}: {
  hours: number[];
  window: MinuteSpan;
}) {
  const depth = useDepth();
  return (
    <>
      {hours.map((m) => (
        <View
          key={m}
          pointerEvents="none"
          style={{
            top: minutesToPx(m - window.startMin),
            backgroundColor: withAlpha(depth.colors.label, 0.07),
          }}
          className="absolute left-0 right-0 h-px"
        />
      ))}
    </>
  );
}

export function Column({
  width,
  height,
  window,
  working,
  appointments,
  timezone,
  hasDivider,
}: {
  width: number;
  height: number;
  window: MinuteSpan;
  working: MinuteSpan[];
  appointments: Ready['columns'][number]['appointments'];
  timezone: string;
  hasDivider: boolean;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const off = complementSpans(working, window);
  const top = (min: number) => minutesToPx(min - window.startMin);
  return (
    <View
      style={{
        width,
        height,
        borderLeftWidth: hasDivider ? 1 : 0,
        borderLeftColor: withAlpha(depth.colors.label, 0.07),
      }}
    >
      {off.map((span) => {
        const spanHeight = minutesToPx(span.endMin - span.startMin);
        return (
          <View
            key={span.startMin}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: top(span.startMin),
              width,
              height: spanHeight,
            }}
          >
            <Hatch width={width} height={spanHeight} />
          </View>
        );
      })}
      {working.length === 0 ? (
        <Text
          style={{ position: 'absolute', top: 12, left: 0, right: 0 }}
          className="text-center text-meta font-semibold text-muted-foreground"
        >
          {t('calendar.dayOff')}
        </Text>
      ) : null}
      {appointments.map((a) => {
        const span = appointmentSpan(a, timezone);
        return (
          <View
            key={a.id}
            style={{
              position: 'absolute',
              left: 4,
              right: 4,
              top: top(span.startMin),
            }}
          >
            <AppointmentBlock
              appointment={a}
              timezone={timezone}
              height={Math.max(
                minutesToPx(span.endMin - span.startMin) - 2,
                MIN_BLOCK,
              )}
            />
          </View>
        );
      })}
    </View>
  );
}
