import { Chip, Surface, Text, useDepth } from '@booking/ui';
import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { WEEKDAYS, formatDateLong, type ISODate } from '@/lib/time';

import type { CalendarWeekView } from '../hooks';
import { filterByStaff, weekSummary } from '../logic';

type Ready = Extract<CalendarWeekView, { status: 'ready' }>;

function firstName(name: string | undefined): string {
  return name?.trim().split(/s+/)[0] ?? '';
}

/** Read-only week overview: one row per day, tap a day to open it. */
export function WeekView({
  view,
  anchor,
  onOpenDay,
}: {
  view: Ready;
  anchor: ISODate;
  onOpenDay: (date: ISODate) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [staffId, setStaffId] = React.useState<string | null>(null);
  const summary = weekSummary({
    anchor,
    today: view.today,
    timezone: view.timezone,
    appointments: filterByStaff(view.appointments, staffId),
    schedule: view.schedule,
    staffId,
  });
  const staffName = view.staff.find((s) => s.id === staffId)?.name;

  return (
    <View>
      {view.staff.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5 pt-3"
          accessibilityRole="radiogroup"
          accessibilityLabel={t('calendar.showFor')}
        >
          {[{ id: null, name: t('calendar.everyone') }, ...view.staff].map(
            (s) => {
              const selected = s.id === staffId;
              return (
                <Chip
                  key={s.id ?? 'all'}
                  variant="filter"
                  label={s.name}
                  selected={selected}
                  onPress={() => setStaffId(s.id)}
                />
              );
            },
          )}
        </ScrollView>
      ) : null}

      <Surface variant="raised" className="mx-5 mt-4 overflow-hidden py-1">
        {summary.days.map((day, index) => {
          const weekday =
            WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
          const num = Number(day.date.slice(8, 10));
          const label = day.isClosed
            ? t(
                day.closedName
                  ? 'calendar.weekDayClosedNamed'
                  : 'calendar.weekDayClosed',
                {
                  day: weekday,
                  date: formatDateLong(day.date),
                  name: day.closedName,
                },
              )
            : t('calendar.weekDayLabel', {
                day: weekday,
                date: formatDateLong(day.date),
                count: day.count,
              });
          const row = (
            <View className="min-h-16 flex-row items-center gap-3.5 px-4 py-2">
              {index > 0 ? (
                <Surface
                  variant="engrave"
                  className="absolute left-4 right-0 top-0 h-0.5"
                />
              ) : null}
              <View
                style={
                  day.isToday
                    ? { backgroundColor: depth.colors.red }
                    : undefined
                }
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                <Text
                  style={
                    day.isToday ? { color: depth.colors.onFill } : undefined
                  }
                  className="text-meta font-semibold uppercase text-muted-foreground"
                >
                  {weekday.slice(0, 3)}
                </Text>
                <Text
                  style={
                    day.isToday ? { color: depth.colors.onFill } : undefined
                  }
                  className="text-title font-semibold"
                >
                  {num}
                </Text>
              </View>
              {day.isClosed ? (
                <Text className="flex-1 text-title text-muted-foreground">
                  {day.closedName
                    ? t('calendar.closedNamed', { name: day.closedName })
                    : t('calendar.closed')}
                </Text>
              ) : (
                <View className="min-w-0 flex-1">
                  <Text className="text-title">
                    {t('calendar.bookingCount', { count: day.count })}
                  </Text>
                  {day.off.length ? (
                    <Text
                      numberOfLines={1}
                      className="text-subtitle text-muted-foreground"
                    >
                      {day.off
                        .map((o) =>
                          t('calendar.offNote', {
                            name: firstName(
                              view.staff.find((s) => s.id === o.staffId)?.name,
                            ),
                            reason: t(`team.timeOff.reasons.${o.reason}`),
                          }),
                        )
                        .join(', ')}
                    </Text>
                  ) : null}
                  <Surface
                    variant="inset"
                    radius={4}
                    className="mt-1.5 h-2 overflow-hidden"
                  >
                    <View
                      style={{
                        width: `${Math.round(day.fullness * 100)}%`,
                        backgroundColor: depth.colors.tint,
                      }}
                      className="h-2 rounded"
                    />
                  </Surface>
                </View>
              )}
              {day.isClosed ? null : (
                <ChevronRight
                  size={16}
                  strokeWidth={2.6}
                  color={depth.colors.secondary}
                />
              )}
            </View>
          );
          return day.isClosed ? (
            <View key={day.date} accessibilityLabel={label} accessible>
              {row}
            </View>
          ) : (
            <Pressable
              key={day.date}
              onPress={() => onOpenDay(day.date)}
              accessibilityRole="button"
              accessibilityLabel={label}
              className="active:bg-muted"
            >
              {row}
            </Pressable>
          );
        })}
      </Surface>
      <Text className="mx-5 mt-4 text-subtitle text-muted-foreground">
        {staffName
          ? t('calendar.weekTotalFor', {
              count: summary.total,
              name: staffName,
            })
          : t('calendar.weekTotal', { count: summary.total })}
      </Text>
    </View>
  );
}
