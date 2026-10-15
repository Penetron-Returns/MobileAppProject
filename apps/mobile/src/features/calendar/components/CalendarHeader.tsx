import { SegmentedControl, Text, useDepth } from '@booking/ui';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import {
  WEEKDAYS,
  formatDateLong,
  formatWeekRange,
  startOfWeek,
  weekdayOf,
  type ISODate,
} from '@/lib/time';
import { weekStrip } from '../logic';
import { type CalendarViewMode } from '../navigation';

export const VIEWS: CalendarViewMode[] = ['day', 'week'];

export function CalendarHeader({
  view,
  anchor,
  today,
  onViewChange,
  onAnchor,
  onShift,
  onNewBooking,
}: {
  view: CalendarViewMode;
  anchor: ISODate;
  today: ISODate;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchor: (date: ISODate) => void;
  onShift: (direction: 1 | -1) => void;
  /** Paid plans: a quiet "New booking" action (they have no "+" in the tab bar). */
  onNewBooking?: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const title =
    view === 'week'
      ? formatWeekRange(startOfWeek(anchor))
      : formatDateLong(anchor);
  const caption =
    view === 'week' ? t('calendar.weekView') : WEEKDAYS[weekdayOf(anchor)];
  return (
    <View className="px-5 pb-2">
      <View className="flex-row items-end justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-subtitle font-semibold text-muted-foreground">
            {caption}
          </Text>
          <Text
            role="heading"
            aria-level="1"
            numberOfLines={1}
            className="text-section font-bold"
          >
            {title}
          </Text>
        </View>
        <View className="flex-row items-center">
          {anchor !== today ? (
            <Pressable
              onPress={() => onAnchor(today)}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.goToToday')}
              className="h-11 justify-center px-3"
            >
              <Text style={{ color: depth.colors.tint }} className="text-title">
                {t('calendar.today')}
              </Text>
            </Pressable>
          ) : null}
          {([-1, 1] as const).map((dir) => (
            <Pressable
              key={dir}
              onPress={() => onShift(dir)}
              accessibilityRole="button"
              accessibilityLabel={t(
                `calendar.${dir === 1 ? 'next' : 'previous'}.${view}`,
              )}
              className="h-11 w-11 items-center justify-center"
            >
              {dir === -1 ? (
                <ChevronLeft size={22} color={depth.colors.tint} />
              ) : (
                <ChevronRight size={22} color={depth.colors.tint} />
              )}
            </Pressable>
          ))}
          {onNewBooking ? (
            <Pressable
              onPress={onNewBooking}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.add')}
              className="h-11 w-11 items-center justify-center"
            >
              <Plus size={22} strokeWidth={2.2} color={depth.colors.tint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SegmentedControl
        className="mt-3"
        label={t('calendar.viewSwitch')}
        value={view}
        onChange={onViewChange}
        options={VIEWS.map((v) => ({
          accessibilityLabel: t(`calendar.viewLabel.${v}`),
          label: t(`calendar.views.${v}`),
          value: v,
        }))}
      />

      {view === 'day' ? (
        <DayStrip anchor={anchor} today={today} onPick={onAnchor} />
      ) : null}
    </View>
  );
}

export function DayStrip({
  anchor,
  today,
  onPick,
}: {
  anchor: ISODate;
  today: ISODate;
  onPick: (date: ISODate) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="mt-2 flex-row justify-between">
      {weekStrip(anchor, today).map((d) => (
        <Pressable
          key={d.date}
          onPress={() => onPick(d.date)}
          accessibilityRole="button"
          accessibilityState={{ selected: d.isSelected }}
          accessibilityLabel={t('calendar.openDay', {
            date: formatDateLong(d.date),
          })}
          className="min-h-11 w-11 items-center justify-center"
        >
          <Text className="text-meta text-muted-foreground">
            {WEEKDAYS[d.weekday].slice(0, 1)}
          </Text>
          <View
            style={
              d.isSelected ? { backgroundColor: depth.colors.tint } : undefined
            }
            className="h-8 w-8 items-center justify-center rounded-full"
          >
            <Text
              style={{
                color: d.isSelected
                  ? depth.colors.onFill
                  : d.isToday
                    ? depth.colors.red
                    : depth.colors.label,
              }}
              className="text-title font-semibold"
            >
              {d.num}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
