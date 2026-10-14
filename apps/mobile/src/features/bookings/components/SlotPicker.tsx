import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { RetryCard } from '@/components/RetryCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  useAvailableDays,
  useAvailableSlots,
} from '@/features/appointments/hooks';
import { useDepth } from '@/hooks/useDepth';
import {
  WEEKDAYS,
  WEEKDAYS_SHORT,
  formatDateLong,
  formatTime,
  parseISODate,
  weekdayOf,
  type ISODate,
} from '@/lib/time';

import { dayRange, pickDay } from '../logic';
import { Chip } from './Chip';

export interface PickedSlot {
  startsAt: string;
  /** Qualified staff free at this time, in the engine's tie-break order. */
  staffIds: string[];
}

/**
 * Live availability: day chips from the availability API, then time chips for
 * the chosen day. Nothing is cached, so a slot taken meanwhile disappears.
 */
export function SlotPicker({
  serviceId,
  staffId,
  timezone,
  today,
  horizonDays,
  date,
  onDateChange,
  selected,
  onSelect,
}: {
  serviceId: string | null;
  staffId: string | null;
  timezone: string;
  today: ISODate;
  horizonDays: number;
  date: ISODate | null;
  onDateChange: (date: ISODate) => void;
  selected: string | null;
  onSelect: (slot: PickedSlot) => void;
}) {
  const { t } = useTranslation();
  const range = dayRange(today, horizonDays);
  const days = useAvailableDays({
    serviceId,
    from: range.from,
    to: range.to,
    staffId,
  });
  const dayList = React.useMemo(() => days.data?.days ?? [], [days.data]);
  const shown = pickDay(dayList, date);

  // Land on the first bookable day once the days arrive or the chosen one vanishes.
  React.useEffect(() => {
    if (shown && shown !== date) onDateChange(shown);
  }, [shown, date, onDateChange]);

  const slots = useAvailableSlots({ serviceId, date: shown, staffId });

  if (!serviceId) {
    return (
      <Text className="text-subtitle text-muted-foreground">
        {t('slots.pickService')}
      </Text>
    );
  }
  if (days.isError) {
    return (
      <RetryCard
        className="mx-0 mt-0"
        title={t('slots.error.title')}
        description={t('slots.error.description')}
        error={days.error}
        onRetry={() => void days.refetch()}
      />
    );
  }
  if (days.isPending) return <SlotSkeleton />;
  if (dayList.length === 0) {
    return (
      <Text className="text-subtitle text-muted-foreground">
        {t('slots.noDays')}
      </Text>
    );
  }

  return (
    <View className="gap-4">
      <DayChips days={dayList} selected={shown} onSelect={onDateChange} />
      {slots.isError ? (
        <RetryCard
          className="mx-0 mt-0"
          title={t('slots.error.title')}
          description={t('slots.error.description')}
          error={slots.error}
          onRetry={() => void slots.refetch()}
        />
      ) : slots.isPending ? (
        <SlotSkeleton />
      ) : slots.data.slots.length === 0 ? (
        <Text className="text-subtitle text-muted-foreground">
          {t('slots.noSlots')}
        </Text>
      ) : (
        <View
          accessibilityLabel={t('slots.times')}
          className="flex-row flex-wrap gap-2"
        >
          {slots.data.slots.map((slot) => (
            <Chip
              key={slot.starts_at}
              label={formatTime(slot.starts_at, timezone)}
              selected={selected === slot.starts_at}
              onPress={() =>
                onSelect({ startsAt: slot.starts_at, staffIds: slot.staff_ids })
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}

function DayChips({
  days,
  selected,
  onSelect,
}: {
  days: ISODate[];
  selected: ISODate | null;
  onSelect: (date: ISODate) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      accessibilityLabel={t('slots.days')}
    >
      {days.map((d) => {
        const isSelected = d === selected;
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${WEEKDAYS[weekdayOf(d)]} ${formatDateLong(d)}`}
            style={isSelected ? depth.primary : depth.button}
            className="min-h-14 w-14 items-center justify-center rounded-2xl"
          >
            <Text
              style={{
                color: isSelected ? '#FFFFFF' : depth.colors.secondary,
              }}
              className="text-meta font-semibold"
            >
              {WEEKDAYS_SHORT[weekdayOf(d)]}
            </Text>
            <Text
              style={{ color: isSelected ? '#FFFFFF' : depth.colors.label }}
              className="text-title font-semibold"
            >
              {parseISODate(d).d}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SlotSkeleton() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('slots.loading')}
      accessibilityState={{ busy: true }}
      className="gap-3"
    >
      <View className="flex-row gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-14 rounded-2xl" />
        ))}
      </View>
      <View className="flex-row gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-[76px] rounded-full" />
        ))}
      </View>
    </View>
  );
}
