import { useRouter } from 'expo-router';
import { Check, ChevronDown, Clock, Plus, X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Header } from '@/components/Header';
import { OptionSheet } from '@/components/OptionSheet';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingCard } from '@/components/States';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import {
  useBusinessHours,
  useReplaceBusinessHours,
} from '@/features/business/hooks';
import { useCanManage } from '@/features/business/me';
import { formatTimeOfDay, WEEKDAYS } from '@/lib/time';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

import {
  nextRange,
  TIME_OPTIONS,
  toHoursRows,
  toWeekSchedule,
  validateWeek,
  type DayHours,
  type TimeRange,
} from '../logic';

export function OperatingHoursScreen() {
  const { t } = useTranslation();
  const hours = useBusinessHours();
  if (hours.data) return <HoursEditor initial={toWeekSchedule(hours.data)} />;
  return (
    <Screen
      header={<Header title={t('hours.title')} fallbackHref="/settings" />}
    >
      {hours.isError ? (
        <ErrorState error={hours.error} onRetry={() => void hours.refetch()} />
      ) : (
        <LoadingCard />
      )}
    </Screen>
  );
}

interface PickerTarget {
  weekday: number;
  index: number;
  field: keyof TimeRange;
}

function HoursEditor({ initial }: { initial: DayHours[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const canManage = useCanManage();
  const [days, setDays] = React.useState(initial);
  const [picker, setPicker] = React.useState<PickerTarget | null>(null);
  const replace = useReplaceBusinessHours({
    onSuccess: () => toast.success(t('hours.saved')),
  });

  const updateDay = (weekday: number, fn: (day: DayHours) => DayHours) =>
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? fn(d) : d)));

  const save = () => {
    const error = validateWeek(days);
    if (error) {
      toast.info(
        t(`hours.errors.${error.reason}`, { day: WEEKDAYS[error.weekday] }),
      );
      return;
    }
    replace.mutate(toHoursRows(days));
  };

  const pickerValue = picker
    ? (days.find((d) => d.weekday === picker.weekday)?.ranges[picker.index]?.[
        picker.field
      ] ?? null)
    : null;

  return (
    <Screen
      header={<Header title={t('hours.title')} fallbackHref="/settings" />}
      footer={
        canManage ? (
          <View className="gap-2.5">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              className="border-primary bg-card h-12 w-full items-center justify-center rounded-xl border shadow-sm active:bg-primary/5"
            >
              <Text className="text-primary text-base font-semibold">
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={replace.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('common.saveChanges')}
              className="bg-primary h-12 w-full flex-row items-center justify-center gap-2 rounded-xl shadow-md active:opacity-90"
            >
              <Icon as={Check} size={18} className="text-primary-foreground" />
              <Text className="text-primary-foreground text-base font-semibold">
                {replace.isPending
                  ? t('common.saving')
                  : t('common.saveChanges')}
              </Text>
            </Pressable>
          </View>
        ) : undefined
      }
    >
      <View className="mx-auto w-full max-w-lg gap-4 pb-4 sm:max-w-xl">
        <Text className="text-muted-foreground text-sm leading-5">
          {t('hours.intro')}
        </Text>
        {days.map((day) => (
          <DayCard
            key={day.weekday}
            day={day}
            editable={canManage}
            onToggle={(isOpen) =>
              updateDay(day.weekday, (d) => ({ ...d, isOpen }))
            }
            onPick={(index, field) =>
              setPicker({ weekday: day.weekday, index, field })
            }
            onAddRange={() =>
              updateDay(day.weekday, (d) => ({
                ...d,
                ranges: [...d.ranges, nextRange(d.ranges)],
              }))
            }
            onRemoveRange={(index) =>
              updateDay(day.weekday, (d) => ({
                ...d,
                ranges: d.ranges.filter((_, i) => i !== index),
              }))
            }
          />
        ))}
      </View>

      <OptionSheet
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        title={
          picker
            ? t(`hours.pick.${picker.field}`, { day: WEEKDAYS[picker.weekday] })
            : ''
        }
        selected={pickerValue}
        options={TIME_OPTIONS.map((time) => ({
          value: time,
          label: formatTimeOfDay(time),
        }))}
        onSelect={(time) => {
          if (!picker) return;
          updateDay(picker.weekday, (d) => ({
            ...d,
            ranges: d.ranges.map((r, i) =>
              i === picker.index ? { ...r, [picker.field]: time } : r,
            ),
          }));
        }}
      />
    </Screen>
  );
}

function DayCard({
  day,
  editable,
  onToggle,
  onPick,
  onAddRange,
  onRemoveRange,
}: {
  day: DayHours;
  editable: boolean;
  onToggle: (isOpen: boolean) => void;
  onPick: (index: number, field: keyof TimeRange) => void;
  onAddRange: () => void;
  onRemoveRange: (index: number) => void;
}) {
  const { t } = useTranslation();
  const label = WEEKDAYS[day.weekday];
  return (
    <View
      className={cn(
        // Shadows set CSS variables, so they must not toggle after the first render.
        'rounded-xl border p-4 shadow-sm',
        day.isOpen
          ? 'bg-card border-border'
          : 'border-border/60 bg-muted/20 border-dashed',
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text
          className={cn(
            'text-base font-bold',
            day.isOpen ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </Text>
        <View className="flex-row items-center gap-2.5">
          <Text
            className={cn(
              'text-xs font-bold uppercase tracking-wider',
              day.isOpen ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {day.isOpen ? t('hours.open') : t('hours.closed')}
          </Text>
          <Switch
            checked={day.isOpen}
            onCheckedChange={onToggle}
            disabled={!editable}
            accessibilityLabel={t('hours.toggle', { day: label })}
          />
        </View>
      </View>
      {day.isOpen ? (
        <View className="mt-3 gap-2">
          {day.ranges.map((range, index) => (
            <View key={index} className="flex-row items-center gap-2">
              <TimeButton
                value={range.opens}
                disabled={!editable}
                onPress={() => onPick(index, 'opens')}
              />
              <Text className="text-muted-foreground text-sm font-medium">
                {t('hours.to')}
              </Text>
              <TimeButton
                value={range.closes}
                disabled={!editable}
                onPress={() => onPick(index, 'closes')}
              />
              {editable && day.ranges.length > 1 ? (
                <Pressable
                  onPress={() => onRemoveRange(index)}
                  accessibilityRole="button"
                  accessibilityLabel={t('hours.removeRange')}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
                >
                  <Icon as={X} size={16} className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>
          ))}
          {editable ? (
            <Pressable
              onPress={onAddRange}
              accessibilityRole="button"
              accessibilityLabel={t('hours.addRange')}
              className="min-h-[44px] flex-row items-center gap-1.5 self-start py-2"
            >
              <Icon as={Plus} size={16} className="text-primary" />
              <Text className="text-primary text-xs font-semibold">
                {t('hours.addRange')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text className="text-muted-foreground mt-2.5 text-sm italic">
          {t('hours.noHours')}
        </Text>
      )}
    </View>
  );
}

function TimeButton({
  value,
  disabled,
  onPress,
}: {
  value: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={formatTimeOfDay(value)}
      className="border-border bg-muted/40 min-h-[44px] flex-1 flex-row items-center justify-between rounded-lg border px-3 py-2 active:border-primary"
    >
      <View className="flex-row items-center gap-1.5">
        <Icon as={Clock} size={14} className="text-muted-foreground" />
        <Text className="text-foreground text-sm font-semibold">
          {formatTimeOfDay(value)}
        </Text>
      </View>
      <Icon as={ChevronDown} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}
