import { Text, useDepth, withAlpha } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { minutesToTime } from '@/lib/time';
import {
  appointmentSpan,
  complementSpans,
  minutesToPx,
  type BlockedSpan,
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
  blocks,
  closed,
  appointments,
  timezone,
  hasDivider,
}: {
  width: number;
  height: number;
  window: MinuteSpan;
  working: MinuteSpan[];
  /** Breaks and time off inside the working hours. */
  blocks: BlockedSpan[];
  /** A closed holiday: the day banner explains it, so no "Not working" here. */
  closed: boolean;
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
      {blocks.map((block) => (
        <UnavailableBlock
          key={`${block.kind}-${block.startMin}-${block.label}`}
          block={block}
          top={top(block.startMin) + 1}
          width={width - 6}
          height={minutesToPx(block.endMin - block.startMin) - 2}
        />
      ))}
      {working.length === 0 && !closed ? (
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

/**
 * A break or time off (CalendarDay board): a dashed, hatched rounded block
 * labelled "Lunch · 13:00" or with the reason ("Leave"). Read only.
 */
function UnavailableBlock({
  block,
  top,
  width,
  height,
}: {
  block: BlockedSpan;
  top: number;
  width: number;
  height: number;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const label =
    block.kind === 'time_off'
      ? t(`team.timeOff.reasons.${block.label}`)
      : `${block.label} · ${minutesToTime(block.startMin)}`;
  return (
    <View
      accessible
      accessibilityLabel={t('calendar.blockedLabel', {
        label,
        start: minutesToTime(block.startMin),
        end: minutesToTime(block.endMin),
      })}
      style={{
        position: 'absolute',
        left: 3,
        top,
        width,
        height,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: withAlpha(depth.colors.label, 0.3),
        backgroundColor: withAlpha(depth.colors.label, 0.05),
        overflow: 'hidden',
        alignItems: 'center',
        // A tall block (a day of leave) labels its top, not its middle.
        justifyContent: height > 160 ? 'flex-start' : 'center',
        paddingTop: height > 160 ? 12 : 0,
      }}
    >
      <View
        style={{ position: 'absolute', left: 0, top: 0 }}
        pointerEvents="none"
      >
        <Hatch width={width} height={height} />
      </View>
      <Text
        numberOfLines={1}
        style={{ color: depth.colors.secondary }}
        className="px-2 text-meta font-semibold"
      >
        {label}
      </Text>
    </View>
  );
}
