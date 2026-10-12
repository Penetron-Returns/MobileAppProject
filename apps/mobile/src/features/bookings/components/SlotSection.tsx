import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { ErrorState, LoadingRows } from '@/components/States';
import { Text } from '@/components/ui/text';
import { useAvailableSlots } from '@/features/appointments/hooks';
import {
  formatTime,
  MONTHS_SHORT,
  parseISODate,
  weekdayOf,
  WEEKDAYS_SHORT,
  type ISODate,
} from '@/lib/time';
import { cn } from '@/lib/utils';

import { SectionLabel } from './ClientSection';

export function SlotSection({
  dates,
  today,
  date,
  onDateChange,
  serviceId,
  staffId,
  timezone,
  startsAt,
  onSlotChange,
}: {
  dates: ISODate[];
  today: ISODate;
  date: ISODate;
  onDateChange: (date: ISODate) => void;
  serviceId: string | null;
  staffId: string | null;
  timezone: string;
  startsAt: string | null;
  onSlotChange: (startsAt: string) => void;
}) {
  const { t } = useTranslation();
  const slots = useAvailableSlots({ serviceId, date, staffId });
  return (
    <View className="gap-2">
      <SectionLabel>{t('addBooking.date')}</SectionLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {dates.map((d) => {
          const isSelected = d === date;
          const { m, d: day } = parseISODate(d);
          return (
            <Pressable
              key={d}
              onPress={() => onDateChange(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={d}
              className={cn(
                'min-h-[44px] w-16 items-center rounded-xl border py-2 active:opacity-80',
                isSelected
                  ? 'border-primary bg-primary'
                  : 'border-border bg-card',
              )}
            >
              <Text
                className={cn(
                  'text-[10px] font-bold uppercase',
                  isSelected
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {d === today
                  ? t('calendar.today')
                  : WEEKDAYS_SHORT[weekdayOf(d)]}
              </Text>
              <Text
                className={cn(
                  'text-base font-bold',
                  isSelected ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {day}
              </Text>
              <Text
                className={cn(
                  'text-[10px]',
                  isSelected
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {MONTHS_SHORT[m - 1]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel>{t('addBooking.time')}</SectionLabel>
      {!serviceId ? (
        <Text className="text-muted-foreground text-sm">
          {t('addBooking.pickServiceFirst')}
        </Text>
      ) : slots.isPending ? (
        <LoadingRows count={1} />
      ) : slots.isError ? (
        <ErrorState error={slots.error} onRetry={() => void slots.refetch()} />
      ) : slots.data.slots.length === 0 ? (
        <Text className="text-muted-foreground text-sm">
          {t('addBooking.noSlots')}
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {slots.data.slots.map((slot) => {
            const isSelected = slot.starts_at === startsAt;
            return (
              <Pressable
                key={slot.starts_at}
                onPress={() => onSlotChange(slot.starts_at)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={cn(
                  'min-h-[44px] w-[74px] items-center justify-center rounded-lg border active:opacity-80',
                  isSelected
                    ? 'border-primary bg-primary'
                    : 'border-border bg-card',
                )}
              >
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    isSelected ? 'text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {formatTime(slot.starts_at, timezone)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
