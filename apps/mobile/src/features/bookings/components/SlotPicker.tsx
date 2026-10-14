import {
  DayChips,
  ErrorState,
  type SlotDay,
  SlotSkeleton,
  type SlotTime,
  Text,
  TimeChips,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useAvailableDays,
  useAvailableSlots,
} from '@/features/appointments/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';
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

export interface PickedSlot {
  startsAt: string;
  /** Qualified staff free at this time, in the engine's tie-break order. */
  staffIds: string[];
}

function toSlotDay(date: ISODate): SlotDay {
  return {
    value: date,
    weekday: WEEKDAYS_SHORT[weekdayOf(date)],
    day: String(parseISODate(date).d),
    accessibilityLabel: `${WEEKDAYS[weekdayOf(date)]} ${formatDateLong(date)}`,
  };
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
  const dayTiles = React.useMemo(() => dayList.map(toSlotDay), [dayList]);
  const shown = pickDay(dayList, date);

  // Land on the first bookable day once the days arrive or the chosen one vanishes.
  React.useEffect(() => {
    if (shown && shown !== date) onDateChange(shown);
  }, [shown, date, onDateChange]);

  const slots = useAvailableSlots({ serviceId, date: shown, staffId });
  const times: SlotTime[] = React.useMemo(
    () =>
      (slots.data?.slots ?? []).map((slot) => ({
        value: slot.starts_at,
        label: formatTime(slot.starts_at, timezone),
      })),
    [slots.data, timezone],
  );

  if (!serviceId) {
    return (
      <Text className="text-subtitle text-muted-foreground">
        {t('slots.pickService')}
      </Text>
    );
  }
  if (isFailed(days)) {
    return (
      <ErrorState
        variant="banner"
        className="mx-0 mt-0"
        title={t('slots.error.title')}
        description={t('slots.error.description')}
        {...describeError(loadError(days))}
        onRetry={() => void days.refetch()}
      />
    );
  }
  if (days.isPending) return <SlotSkeleton label={t('slots.loading')} />;
  if (dayList.length === 0) {
    return (
      <Text className="text-subtitle text-muted-foreground">
        {t('slots.noDays')}
      </Text>
    );
  }

  return (
    <View className="gap-4">
      <DayChips
        days={dayTiles}
        selected={shown}
        onSelect={(value) => onDateChange(value as ISODate)}
        label={t('slots.days')}
      />
      {isFailed(slots) ? (
        <ErrorState
          variant="banner"
          className="mx-0 mt-0"
          title={t('slots.error.title')}
          description={t('slots.error.description')}
          {...describeError(loadError(slots))}
          onRetry={() => void slots.refetch()}
        />
      ) : slots.isPending ? (
        <SlotSkeleton label={t('slots.loading')} />
      ) : times.length === 0 ? (
        <Text className="text-subtitle text-muted-foreground">
          {t('slots.noSlots')}
        </Text>
      ) : (
        <TimeChips
          times={times}
          selected={selected}
          label={t('slots.times')}
          onSelect={(startsAt) => {
            const slot = slots.data?.slots.find(
              (s) => s.starts_at === startsAt,
            );
            if (slot) onSelect({ startsAt, staffIds: slot.staff_ids });
          }}
        />
      )}
    </View>
  );
}
