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

import { useAvailabilityConfig } from '@/features/availability/hooks';
import { closedDays } from '@/features/availability/specialDays';
import {
  useAvailableDays,
  useAvailableSlots,
} from '@/features/appointments/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';
import {
  addDays,
  formatWeekdayDayMonth,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  formatDateLong,
  formatTime,
  minutesSinceMidnight,
  minutesToTime,
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
 * the chosen day. Browsing reuses results for ~20s and shows the previous
 * ones dimmed (and untappable) while the next load; `create_appointment`
 * re-validates, so a slot taken meanwhile is refused there.
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
  preferredTime,
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
  /** `HH:mm` to pick once when that time is free (from a calendar long-press). */
  preferredTime?: string | null;
}) {
  const { t } = useTranslation();
  const range = dayRange(today, horizonDays);
  const days = useAvailableDays({
    serviceId,
    from: range.from,
    to: range.to,
    staffId,
  });
  // Why a date is missing from the chips: a holiday that closes the business.
  // A year of config is a heavy call and only feeds a footnote, so it waits
  // until the chips are on screen.
  const config = useAvailabilityConfig(
    range.from,
    range.to < addDays(range.from, 365) ? range.to : addDays(range.from, 365),
    Boolean(days.data),
  );
  const closed = closedDays(
    config.data?.special_days ?? [],
    range.from,
    range.to,
  ).slice(0, 3);
  const closedNote = closed.length ? (
    <Text className="text-subtitle text-muted-foreground">
      {t('slots.closedOn', {
        days: closed
          .map((d) => `${d.name}, ${formatWeekdayDayMonth(d.date)}`)
          .join('; '),
      })}
    </Text>
  ) : null;
  const dayList = React.useMemo(() => days.data?.days ?? [], [days.data]);
  const dayTiles = React.useMemo(() => dayList.map(toSlotDay), [dayList]);
  const shown = pickDay(dayList, date);

  // Land on the first bookable day once the days arrive or the chosen one vanishes.
  React.useEffect(() => {
    if (shown && shown !== date) onDateChange(shown);
  }, [shown, date, onDateChange]);

  // While the days load, fetch the likeliest first day alongside them
  // (the chosen date, else today) instead of waiting for them.
  const slots = useAvailableSlots({
    serviceId,
    date: shown ?? date ?? today,
    staffId,
  });
  const slotsStale = slots.isPlaceholderData;
  const times: SlotTime[] = React.useMemo(
    () =>
      (slots.data?.slots ?? []).map((slot) => ({
        value: slot.starts_at,
        label: formatTime(slot.starts_at, timezone),
      })),
    [slots.data, timezone],
  );

  // Pick the time the owner long-pressed, once, if it is still free.
  const appliedPreferred = React.useRef(false);
  React.useEffect(() => {
    if (!preferredTime || appliedPreferred.current || selected) return;
    if (slots.isPlaceholderData) return;
    const slot = slots.data?.slots.find(
      (s) =>
        minutesToTime(minutesSinceMidnight(s.starts_at, timezone)) ===
        preferredTime,
    );
    if (!slot) return;
    appliedPreferred.current = true;
    onSelect({ startsAt: slot.starts_at, staffIds: slot.staff_ids });
  }, [
    preferredTime,
    selected,
    slots.data,
    slots.isPlaceholderData,
    timezone,
    onSelect,
  ]);

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
      <View className="gap-2">
        <Text className="text-subtitle text-muted-foreground">
          {t('slots.noDays')}
        </Text>
        {closedNote}
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Dimmed dimmed={days.isPlaceholderData}>
        <DayChips
          days={dayTiles}
          selected={shown}
          onSelect={(value) => onDateChange(value as ISODate)}
          label={t('slots.days')}
        />
      </Dimmed>
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
        <Dimmed dimmed={slotsStale}>
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
        </Dimmed>
      )}
      {closedNote}
    </View>
  );
}

/** Previous results shown while the next load: faded, and not tappable. */
function Dimmed({
  dimmed,
  children,
}: {
  dimmed: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      pointerEvents={dimmed ? 'none' : 'auto'}
      accessibilityState={{ busy: dimmed }}
      className={dimmed ? 'opacity-50' : undefined}
    >
      {children}
    </View>
  );
}
