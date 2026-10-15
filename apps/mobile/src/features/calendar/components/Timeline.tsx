import { router } from 'expo-router';
import { CalendarX2, Utensils } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AppointmentListItem } from '@/features/appointments/hooks';
import { formatTime, minutesToTime } from '@/lib/time';
import { cn } from '@/lib/utils';

import {
  appointmentSpan,
  breaksBetween,
  layoutLanes,
  minutesToPx,
  type MinuteSpan,
} from '../logic';

export function hourMarks(window: MinuteSpan) {
  const marks: number[] = [];
  for (let m = window.startMin; m < window.endMin; m += 60) marks.push(m);
  return marks;
}

export function HourLabels({ window }: { window: MinuteSpan }) {
  return (
    <View>
      {hourMarks(window).map((m) => (
        <View
          key={m}
          className="items-end pr-3 pt-1"
          style={{ height: minutesToPx(60) }}
        >
          <Text className="text-muted-foreground text-xs font-medium">
            {minutesToTime(m)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TimelineColumn({
  window,
  shifts,
  appointments,
  busy = [],
  timezone,
  compact,
}: {
  window: MinuteSpan;
  shifts: MinuteSpan[];
  appointments: AppointmentListItem[];
  /** Google Calendar busy time for this day */
  busy?: MinuteSpan[];
  timezone: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const height = minutesToPx(window.endMin - window.startMin);
  const blocks = layoutLanes(
    appointments.map((item) => ({
      item,
      span: appointmentSpan(item, timezone),
    })),
  );
  const isClosed = shifts.length === 0;
  const top = (min: number) => minutesToPx(min - window.startMin);

  return (
    <View
      className={cn('relative', isClosed && 'bg-muted/10')}
      style={{ height }}
    >
      {hourMarks(window).map((m) => (
        <View
          key={m}
          className="border-border border-b border-dashed"
          style={{ height: minutesToPx(60) }}
        />
      ))}

      {isClosed && appointments.length === 0 ? (
        <View className="absolute inset-0 items-center justify-center">
          <View className="bg-muted/40 rounded-full px-3 py-1">
            <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              {t('calendar.closed')}
            </Text>
          </View>
        </View>
      ) : null}

      {breaksBetween(shifts).map((b) => (
        <View
          key={b.startMin}
          className="bg-accent/40 border-border absolute left-1 right-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed"
          style={{
            top: top(b.startMin),
            height: minutesToPx(b.endMin - b.startMin),
          }}
        >
          <Icon as={Utensils} size={14} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
            {t('calendar.break')}
          </Text>
        </View>
      ))}

      {busy.map((b) => (
        <BusyBlock
          key={`${b.startMin}-${b.endMin}`}
          span={b}
          top={top(Math.max(b.startMin, window.startMin))}
          height={minutesToPx(
            Math.min(b.endMin, window.endMin) -
              Math.max(b.startMin, window.startMin),
          )}
          compact={compact}
        />
      ))}

      {blocks.map(({ item, span, lane, lanes }) => (
        <View
          key={item.id}
          className="absolute px-0.5"
          style={{
            top: top(span.startMin),
            height: Math.max(minutesToPx(span.endMin - span.startMin), 36),
            left: `${(lane / lanes) * 100}%`,
            width: `${100 / lanes}%`,
          }}
        >
          <AppointmentBlock
            appointment={item}
            timezone={timezone}
            compact={compact}
          />
        </View>
      ))}
    </View>
  );
}

function BusyBlock({
  span,
  top,
  height,
  compact,
}: {
  span: MinuteSpan;
  top: number;
  height: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (height <= 0) return null;
  const time = `${minutesToTime(span.startMin)} - ${minutesToTime(span.endMin)}`;
  return (
    <View
      className="bg-muted/60 border-muted-foreground/30 absolute left-1 right-1 flex-row items-start gap-1.5 overflow-hidden rounded-xl border border-dashed px-2 py-1"
      style={{ top, height }}
      accessible
      accessibilityLabel={t('calendar.busyLabel', { time })}
    >
      <Icon
        as={CalendarX2}
        size={12}
        className="text-muted-foreground mt-0.5"
      />
      {compact ? null : (
        <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
          {t('calendar.busy')}
        </Text>
      )}
    </View>
  );
}

function AppointmentBlock({
  appointment,
  timezone,
  compact,
}: {
  appointment: AppointmentListItem;
  timezone: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const isConfirmed = appointment.status === 'confirmed';
  const clientName = appointment.client.name ?? t('dashboard.unknownClient');
  const time = `${formatTime(appointment.starts_at, timezone)} - ${formatTime(appointment.ends_at, timezone)}`;
  return (
    <Pressable
      onPress={() => router.push(`/bookings/${appointment.id}` as never)}
      className="bg-card border-border active:border-primary h-full flex-row overflow-hidden rounded-xl border shadow-sm"
      accessibilityRole="button"
      accessibilityLabel={t('calendar.blockLabel', {
        service: appointment.service.name,
        client: clientName,
        time,
      })}
    >
      <View
        className={cn(
          'h-full w-1 flex-shrink-0',
          isConfirmed ? 'bg-primary' : 'bg-muted-foreground',
        )}
      />
      <View className={cn('flex-1', compact ? 'p-1.5' : 'p-2.5')}>
        <Text
          numberOfLines={1}
          className={cn(
            'text-foreground font-semibold',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {appointment.service.name}
        </Text>
        <Text
          numberOfLines={1}
          className="text-muted-foreground text-[11px] font-medium"
        >
          {compact ? clientName : `${clientName} · ${appointment.staff.name}`}
        </Text>
        <Text numberOfLines={1} className="text-muted-foreground text-[10px]">
          {compact ? time : `${time} · ${t(`status.${appointment.status}`)}`}
        </Text>
      </View>
    </Pressable>
  );
}
