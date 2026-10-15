import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { AppointmentListItem } from '@/features/appointments/hooks';
import { busySpansForDate } from '@/features/calendar-sync/logic';
import type { InstantRange } from '@/lib/range';
import {
  businessDate,
  parseISODate,
  timeToMinutes,
  weekdayOf,
  WEEKDAYS_SHORT,
  type ISODate,
} from '@/lib/time';
import { cn } from '@/lib/utils';

import {
  appointmentSpan,
  countByDate,
  monthGrid,
  shiftsForWeekday,
  timelineWindow,
  weekDates,
} from '../logic';
import { HourLabels, TimelineColumn } from './Timeline';

interface HoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

interface ViewProps {
  anchor: ISODate;
  today: ISODate;
  appointments: AppointmentListItem[];
  /** Google Calendar busy time in the visible period */
  busy: InstantRange[];
  hours: HoursRow[];
  timezone: string;
  onOpenDay: (date: ISODate) => void;
}

function byDate(appointments: AppointmentListItem[], timezone: string) {
  const map = new Map<ISODate, AppointmentListItem[]>();
  for (const a of appointments) {
    const date = businessDate(a.starts_at, timezone);
    map.set(date, [...(map.get(date) ?? []), a]);
  }
  return map;
}

export function DayView({
  anchor,
  appointments,
  busy,
  hours,
  timezone,
}: ViewProps) {
  const shifts = shiftsForWeekday(hours, weekdayOf(anchor));
  const busySpans = busySpansForDate(busy, anchor, timezone);
  const window = timelineWindow([
    ...shifts,
    ...appointments.map((a) => appointmentSpan(a, timezone)),
  ]);
  return (
    <View className="bg-card border-border flex-row overflow-hidden rounded-2xl border py-4 shadow-sm">
      <View className="w-14">
        <HourLabels window={window} />
      </View>
      <View className="flex-1 pr-3">
        <TimelineColumn
          window={window}
          shifts={shifts}
          appointments={appointments}
          busy={busySpans}
          timezone={timezone}
        />
      </View>
    </View>
  );
}

const DAY_COLUMN_WIDTH = 140;

export function WeekView({
  anchor,
  today,
  appointments,
  busy,
  hours,
  timezone,
  onOpenDay,
}: ViewProps) {
  const { t } = useTranslation();
  const dates = weekDates(anchor);
  const grouped = byDate(appointments, timezone);
  const window = timelineWindow([
    ...hours.map((h) => ({
      startMin: timeToMinutes(h.opens_at),
      endMin: timeToMinutes(h.closes_at),
    })),
    ...appointments.map((a) => appointmentSpan(a, timezone)),
  ]);
  return (
    <View className="bg-card border-border flex-row overflow-hidden rounded-2xl border shadow-sm">
      <View className="border-border w-14 border-r">
        <View className="border-border h-16 items-center justify-center border-b">
          <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
            {t('calendar.time')}
          </Text>
        </View>
        <View className="py-4">
          <HourLabels window={window} />
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View>
          <View className="border-border bg-muted/20 h-16 flex-row border-b">
            {dates.map((date) => {
              const count = grouped.get(date)?.length ?? 0;
              const isToday = date === today;
              const isClosed =
                shiftsForWeekday(hours, weekdayOf(date)).length === 0;
              return (
                <Pressable
                  key={date}
                  onPress={() => onOpenDay(date)}
                  className={cn(
                    'border-border items-center justify-center border-r px-1 py-2 active:bg-accent/40',
                    isToday && 'bg-primary/5',
                  )}
                  style={{ width: DAY_COLUMN_WIDTH }}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.openDay', { date })}
                >
                  <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                    {WEEKDAYS_SHORT[weekdayOf(date)]}
                  </Text>
                  <View
                    className={cn(
                      'mt-0.5 h-7 w-7 items-center justify-center rounded-full',
                      isToday && 'bg-primary',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-bold',
                        isToday ? 'text-primary-foreground' : 'text-foreground',
                      )}
                    >
                      {parseISODate(date).d}
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-[10px] font-medium">
                    {count > 0
                      ? t('calendar.apptCount', { count })
                      : isClosed
                        ? t('calendar.closed')
                        : t('calendar.free')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="flex-row py-4">
            {dates.map((date) => (
              <View
                key={date}
                className="border-border border-r"
                style={{ width: DAY_COLUMN_WIDTH }}
              >
                <TimelineColumn
                  window={window}
                  shifts={shiftsForWeekday(hours, weekdayOf(date))}
                  appointments={grouped.get(date) ?? []}
                  busy={busySpansForDate(busy, date, timezone)}
                  timezone={timezone}
                  compact
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const MAX_LINES = 4;

export function MonthView({
  anchor,
  today,
  appointments,
  timezone,
  onOpenDay,
}: ViewProps) {
  const { t } = useTranslation();
  const counts = countByDate(appointments, timezone);
  const weeks = monthGrid(anchor);
  return (
    <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
      <View className="border-border bg-muted/20 h-11 flex-row border-b">
        {MONDAY_FIRST.map((wd, idx) => (
          <View
            key={wd}
            className={cn(
              'flex-1 items-center justify-center',
              idx < 6 && 'border-border/60 border-r',
            )}
          >
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              {WEEKDAYS_SHORT[wd]}
            </Text>
          </View>
        ))}
      </View>
      {weeks.map((week, weekIdx) => (
        <View
          key={week[0].date}
          className={cn(
            'min-h-[68px] flex-row',
            weekIdx < weeks.length - 1 && 'border-border/60 border-b',
          )}
        >
          {week.map((cell, dayIdx) => {
            const count = counts[cell.date] ?? 0;
            const isToday = cell.date === today;
            return (
              <Pressable
                key={cell.date}
                onPress={() => onOpenDay(cell.date)}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.monthCellLabel', {
                  date: cell.date,
                  count,
                })}
                className={cn(
                  'min-h-[68px] flex-1 gap-1 p-1.5 active:bg-accent/40',
                  dayIdx < 6 && 'border-border/60 border-r',
                  !cell.isCurrentMonth && 'bg-muted/10 opacity-40',
                  isToday && 'bg-primary/5',
                )}
              >
                <View
                  className={cn(
                    'h-5 w-5 items-center justify-center rounded-full',
                    isToday && 'bg-primary',
                  )}
                >
                  <Text
                    className={cn(
                      'text-[11px]',
                      isToday
                        ? 'text-primary-foreground font-bold'
                        : 'text-foreground font-semibold',
                    )}
                  >
                    {parseISODate(cell.date).d}
                  </Text>
                </View>
                <View className="gap-1">
                  {Array.from(
                    { length: Math.min(count, MAX_LINES) },
                    (_, i) => (
                      <View
                        key={i}
                        className="bg-primary h-1 w-full rounded-full"
                      />
                    ),
                  )}
                  {count > MAX_LINES ? (
                    <Text className="text-muted-foreground text-[9px] font-semibold">
                      +{count - MAX_LINES}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
