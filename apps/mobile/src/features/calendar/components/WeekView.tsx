import type { TFunction } from 'i18next';
import { Chip, Menu, Surface, Text, useDepth } from '@booking/ui';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { WEEKDAYS, formatDateLong, type ISODate } from '@/lib/time';

import type { CalendarWeekView } from '../hooks';
import {
  filterByStaff,
  MAX_STAFF_CHIPS,
  weekSummary,
  type WeekDay,
} from '../logic';

type Ready = Extract<CalendarWeekView, { status: 'ready' }>;

/** The "everyone" option of the staff menu; a real staff id never looks like this. */
const ALL = 'all';

function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
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
  const summary = React.useMemo(
    () =>
      weekSummary({
        anchor,
        today: view.today,
        timezone: view.timezone,
        appointments: filterByStaff(view.appointments, staffId),
        schedule: view.schedule,
        staffId,
      }),
    [
      anchor,
      view.today,
      view.timezone,
      view.appointments,
      view.schedule,
      staffId,
    ],
  );
  const staffName = view.staff.find((s) => s.id === staffId)?.name;
  const rows = React.useMemo(
    () => summary.days.map((day, index) => toRow(day, index, view.staff, t)),
    [summary.days, view.staff, t],
  );

  return (
    <View>
      {view.staff.length > MAX_STAFF_CHIPS ? (
        <View className="px-5 pt-3">
          <Menu
            align="start"
            selected={staffId ?? ALL}
            onSelect={(value) => setStaffId(value === ALL ? null : value)}
            options={[
              { value: ALL, label: t('calendar.everyone') },
              ...view.staff.map((s) => ({ value: s.id, label: s.name })),
            ]}
            accessibilityLabel={t('calendar.showForPick', {
              name: staffName ?? t('calendar.everyone'),
            })}
            className="min-h-11 flex-row items-center gap-1.5 self-start"
          >
            <Text className="text-title font-semibold">
              {staffName ?? t('calendar.everyone')}
            </Text>
            <ChevronDown
              size={14}
              strokeWidth={2.8}
              color={depth.colors.secondary}
            />
          </Menu>
        </View>
      ) : view.staff.length > 1 ? (
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
        {rows.map((row) => (
          <WeekRow key={row.day.date} row={row} onOpenDay={onOpenDay} />
        ))}
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

interface WeekRowModel {
  day: WeekDay;
  index: number;
  weekday: string;
  num: number;
  label: string;
  /** "Thandi off (leave), ..." or null. */
  offNote: string | null;
}

/** Everything a row shows that needs date or string work, computed once per summary. */
function toRow(
  day: WeekDay,
  index: number,
  staff: { id: string; name: string }[],
  t: TFunction,
): WeekRowModel {
  const weekday = WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
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
  return {
    day,
    index,
    weekday,
    num: Number(day.date.slice(8, 10)),
    label,
    offNote: day.off.length
      ? day.off
          .map((o) =>
            t('calendar.offNote', {
              name: firstName(staff.find((s) => s.id === o.staffId)?.name),
              reason: t(`team.timeOff.reasons.${o.reason}`),
            }),
          )
          .join(', ')
      : null,
  };
}

const WeekRow = React.memo(function WeekRow({
  row,
  onOpenDay,
}: {
  row: WeekRowModel;
  onOpenDay: (date: ISODate) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { day, index, weekday, num, label, offNote } = row;
  const content = (
    <View className="min-h-16 flex-row items-center gap-3.5 px-4 py-2">
      {index > 0 ? (
        <Surface
          variant="engrave"
          className="absolute left-4 right-0 top-0 h-0.5"
        />
      ) : null}
      <View
        style={day.isToday ? { backgroundColor: depth.colors.red } : undefined}
        className="h-11 w-11 items-center justify-center rounded-full"
      >
        <Text
          style={day.isToday ? { color: depth.colors.onFill } : undefined}
          className="text-meta font-semibold uppercase text-muted-foreground"
        >
          {weekday.slice(0, 3)}
        </Text>
        <Text
          style={day.isToday ? { color: depth.colors.onFill } : undefined}
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
          {offNote ? (
            <Text
              numberOfLines={1}
              className="text-subtitle text-muted-foreground"
            >
              {offNote}
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
    <View accessibilityLabel={label} accessible>
      {content}
    </View>
  ) : (
    <Pressable
      onPress={() => onOpenDay(day.date)}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:bg-muted"
    >
      {content}
    </Pressable>
  );
});
