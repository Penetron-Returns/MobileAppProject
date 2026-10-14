import {
  ErrorState,
  GlassPage,
  Group,
  ListSkeleton,
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
import { isFailed, loadError } from '@/lib/offline';
import { WEEKDAYS } from '@/lib/time';
import { toast, describeError } from '@/lib/toast';

import {
  nextRange,
  toHoursRows,
  toWeekSchedule,
  validateWeek,
  type DayHours,
  type TimeRange,
} from '../logic';
import { DayHoursRow, type PickedTime } from './DayHoursRow';

export function OperatingHoursScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const hours = useBusinessHours();
  if (hours.data) return <HoursEditor initial={toWeekSchedule(hours.data)} />;
  return (
    <GlassPage
      title={t('hours.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {isFailed(hours) ? (
        <ErrorState
          variant="banner"
          {...describeError(loadError(hours))}
          onRetry={() => void hours.refetch()}
        />
      ) : (
        <ListSkeleton rows={7} />
      )}
    </GlassPage>
  );
}

interface PickerTarget extends PickedTime {
  weekday: number;
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

  return (
    <GlassPage
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
      <Group radius={26} className="mx-4">
        {days.map((day, i) => (
          <DayHoursRow
            key={day.weekday}
            day={day}
            label={WEEKDAYS[day.weekday]}
            editable={canManage}
            showSeparator={i > 0}
            picked={picker?.weekday === day.weekday ? picker : null}
            onToggle={(isOpen) => {
              updateDay(day.weekday, (d) => ({ ...d, isOpen }));
              if (picker?.weekday === day.weekday) setPicker(null);
            }}
            onPick={(index, field) =>
              setPicker((cur) =>
                cur?.weekday === day.weekday &&
                cur.index === index &&
                cur.field === field
                  ? null
                  : { weekday: day.weekday, index, field },
              )
            }
            onClosePicker={() => setPicker(null)}
            onChangeTime={(index, field: keyof TimeRange, time) =>
              updateDay(day.weekday, (d) => ({
                ...d,
                ranges: d.ranges.map((r, j) =>
                  j === index ? { ...r, [field]: time } : r,
                ),
              }))
            }
            onAddRange={() => {
              updateDay(day.weekday, (d) => ({
                ...d,
                ranges: [...d.ranges, nextRange(d.ranges)],
              }));
              setPicker(null);
            }}
            onRemoveRange={(index) => {
              updateDay(day.weekday, (d) => ({
                ...d,
                ranges: d.ranges.filter((_, j) => j !== index),
              }));
              setPicker(null);
            }}
          />
        ))}
      </Group>
      <Text className="mx-5 mt-2.5 text-subtitle text-muted-foreground">
        {t('settings.hours.hint')}
      </Text>
    </GlassPage>
  );
}
