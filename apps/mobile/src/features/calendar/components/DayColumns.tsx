import { Text, useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type GestureResponderEvent } from 'react-native';

import type { AppointmentListItem } from '@/features/appointments/hooks';
import { minutesToTime } from '@/lib/time';

import {
  BLOCK_INSET_PX,
  BLOCK_RADIUS,
  GRID_CELL,
  blockFrame,
  blockHorizontal,
  cellFrames,
  type BlockFrame,
} from '../grid';
import type { CalendarDayView } from '../hooks';
import {
  appointmentSpan,
  complementSpans,
  minuteAtOffset,
  minutesToPx,
  type BlockedSpan,
  type MinuteSpan,
} from '../logic';
import { AppointmentBlock } from './AppointmentBlock';
import { Hatch } from './Hatch';

export type Ready = Extract<CalendarDayView, { status: 'ready' }>;

interface ColumnProps {
  staffId: string;
  width: number;
  height: number;
  window: MinuteSpan;
  working: MinuteSpan[];
  /** Breaks and time off inside the working hours. */
  blocks: BlockedSpan[];
  /** A closed holiday: the day banner explains it, so no "Not working" here. */
  closed: boolean;
  appointments: AppointmentListItem[];
  timezone: string;
  /**
   * Long-press on an empty part of the column (paid plans' quiet manual-booking
   * fallback). One stable callback serves every column.
   */
  onLongPressEmpty?: (staffId: string, minutes: number) => void;
}

/** One staff column. Memoised: a clock tick or a scroll in a sibling never re-renders it. */
export const Column = React.memo(function Column({
  staffId,
  width,
  height,
  window,
  working,
  blocks,
  closed,
  appointments,
  timezone,
  onLongPressEmpty,
}: ColumnProps) {
  const { t } = useTranslation();
  const horizontal = blockHorizontal(width);
  const off = React.useMemo(
    () => complementSpans(working, window),
    [working, window],
  );
  const placed = React.useMemo(
    () =>
      appointments.map((a) => ({
        appointment: a,
        frame: blockFrame(appointmentSpan(a, timezone), window),
      })),
    [appointments, timezone, window],
  );
  const onLongPress = React.useCallback(
    (event: GestureResponderEvent) =>
      onLongPressEmpty?.(
        staffId,
        minuteAtOffset(event.nativeEvent.locationY, window),
      ),
    [onLongPressEmpty, staffId, window],
  );
  return (
    <View style={{ width, height }}>
      <GridCells window={window} width={horizontal.width} />
      {onLongPressEmpty ? (
        <Pressable
          // Screen readers use the header New booking action instead.
          accessible={false}
          delayLongPress={450}
          onLongPress={onLongPress}
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
              top:
                minutesToPx(span.startMin - window.startMin) + BLOCK_INSET_PX,
              width: horizontal.width,
              height: spanHeight,
              borderRadius: BLOCK_RADIUS,
              overflow: 'hidden',
            }}
          >
            <Hatch />
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
      {placed.map(({ appointment, frame }) => (
        <View
          key={appointment.id}
          style={{
            position: 'absolute',
            left: horizontal.left,
            width: horizontal.width,
            top: frame.top,
          }}
        >
          <AppointmentBlock
            appointment={appointment}
            timezone={timezone}
            height={frame.height}
          />
        </View>
      ))}
    </View>
  );
});

/** The empty hour cells behind a column. Static for a given window, width and scheme. */
const GridCells = React.memo(function GridCells({
  window,
  width,
}: {
  window: MinuteSpan;
  width: number;
}) {
  const depth = useDepth();
  const color = GRID_CELL[depth.scheme];
  return (
    <>
      {cellFrames(window).map((cell) => (
        <View
          key={cell.top}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: BLOCK_INSET_PX,
            top: cell.top,
            width,
            height: cell.height,
            borderRadius: BLOCK_RADIUS,
            backgroundColor: color,
          }}
        />
      ))}
    </>
  );
});

/**
 * A break or time off (CalendarDay board): a dashed, tinted rounded block
 * labelled "Lunch · 13:00" or with the reason ("Leave"). Read only.
 */
const UnavailableBlock = React.memo(function UnavailableBlock({
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
      <Hatch />
      <Text
        numberOfLines={1}
        style={{ color: depth.colors.secondary }}
        className="px-2 text-meta font-semibold"
      >
        {label}
      </Text>
    </View>
  );
});
