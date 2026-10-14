import {
  ErrorState,
  Group,
  ListSkeleton,
  OptionSheet,
  Page,
  SaveFooter,
  Text,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBusinessHours,
  useReplaceBusinessHours,
} from '@/features/business/hooks';
import { useCanManage } from '@/features/business/me';
import { formatTimeOfDay, WEEKDAYS } from '@/lib/time';
import { toast, describeError } from '@/lib/toast';

import {
  nextRange,
  TIME_OPTIONS,
  toHoursRows,
  toWeekSchedule,
  validateWeek,
  type DayHours,
  type TimeRange,
} from '../logic';
import { DayHoursRow } from './DayHoursRow';

export function OperatingHoursScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const hours = useBusinessHours();
  if (hours.data) return <HoursEditor initial={toWeekSchedule(hours.data)} />;
  return (
    <Page
      title={t('hours.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {hours.isError ? (
        <ErrorState
          variant="banner"
          {...describeError(hours.error)}
          onRetry={() => void hours.refetch()}
        />
      ) : (
        <ListSkeleton rows={7} />
      )}
    </Page>
  );
}

interface PickerTarget {
  weekday: number;
  index: number;
  field: keyof TimeRange;
}

function HoursEditor({ initial }: { initial: DayHours[] }) {
  const { t } = useTranslation();
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
    <Page
      title={t('hours.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      footer={
        canManage ? (
          <SaveFooter
            label={
              replace.isPending ? t('common.saving') : t('common.saveChanges')
            }
            onPress={save}
            disabled={replace.isPending}
          />
        ) : undefined
      }
    >
      <Group className="mt-5">
        {days.map((day, i) => (
          <DayHoursRow
            key={day.weekday}
            day={day}
            label={WEEKDAYS[day.weekday]}
            editable={canManage}
            showSeparator={i > 0}
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
      </Group>
      <Text className="mx-5 mt-3 text-meta text-muted-foreground">
        {t('settings.hours.hint')}
      </Text>

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
    </Page>
  );
}
