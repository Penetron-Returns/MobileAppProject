import { Text, useDepth, withAlpha } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import { minutesToTime } from '@/lib/time';
import {
  appointmentSpan,
  complementSpans,
  minuteAtOffset,
  minutesToPx,
  type BlockedSpan,
  type MinuteSpan,
} from '../logic';
import {
  BLOCK_RADIUS,
  BLOCK_INSET_PX,
  GRID_CELL,
  blockHorizontal,
  cellFrames,
  blockFrame,
  type BlockFrame,
} from '../grid';
import { AppointmentBlock } from './AppointmentBlock';
import { Hatch } from './Hatch';
import type { CalendarDayView } from '../hooks';

export type Ready = Extract<CalendarDayView, { status: 'ready' }>;

export function Column({
  width,
  height,
  window,
  working,
  blocks,
  closed,
  appointments,
  timezone,
  onLongPressEmpty,
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
  /** Long-press on an empty part of the column (paid plans' quiet manual-booking fallback). */
  onLongPressEmpty?: (minutes: number) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const horizontal = blockHorizontal(width);
  const off = complementSpans(working, window);
  const top = (min: number) => minutesToPx(min - window.startMin);
  return (
    <View style={{ width, height }}>
      {cellFrames(window).map((cell) => (
        <View
          key={cell.top}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: horizontal.left,
            top: cell.top,
            width: horizontal.width,
            height: cell.height,
            borderRadius: BLOCK_RADIUS,
            backgroundColor: GRID_CELL[depth.scheme],
          }}
        />
      ))}
      {onLongPressEmpty ? (
        <Pressable
          // Screen readers use the header New booking action instead.
          accessible={false}
          delayLongPress={450}
          onLongPress={(event: GestureResponderEvent) =>
            onLongPressEmpty(
              minuteAtOffset(event.nativeEvent.locationY, window),
            )
          }
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
        />
      ) : null}
      {off.map((span) => {
        const spanHeight =
          minutesToPx(span.endMin - span.startMin) - 2 * BLOCK_INSET_PX;
        return (
          <View
            key={span.startMin}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: horizontal.left,
              top: top(span.startMin) + BLOCK_INSET_PX,
              width: horizontal.width,
              height: spanHeight,
              borderRadius: BLOCK_RADIUS,
              overflow: 'hidden',
            }}
          >
            <Hatch width={horizontal.width} height={spanHeight} />
          </View>
        );
      })}
      {blocks.map((block) => (
        <UnavailableBlock
          key={`${block.kind}-${block.startMin}-${block.label}`}
          block={block}
          frame={blockFrame(block, window)}
          width={horizontal.width}
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
        const frame = blockFrame(appointmentSpan(a, timezone), window);
        return (
          <View
            key={a.id}
            style={{
              position: 'absolute',
              left: horizontal.left,
              width: horizontal.width,
              top: frame.top,
            }}
          >
            <AppointmentBlock
              appointment={a}
              timezone={timezone}
              height={frame.height}
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
  frame,
  width,
}: {
  block: BlockedSpan;
  frame: BlockFrame;
  width: number;
}) {
  const { top, height } = frame;
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
        left: BLOCK_INSET_PX,
        top,
        width,
        height,
        borderRadius: BLOCK_RADIUS,
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
