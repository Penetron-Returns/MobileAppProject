import {
  ErrorState,
  GlassPage,
  Group,
  GroupRow,
  ListSkeleton,
  Presenter,
  SaveFooter,
  Text,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DayHoursRow } from '@/features/availability/components/DayHoursRow';
import {
  toHoursRows,
  toWeekSchedule,
  validateWeek,
  type DayHours,
  type TimeEnd,
} from '@/features/availability/week';
import {
  useBusinessHours,
  useReplaceBusinessHours,
} from '@/features/business/hooks';
import { useCanManage } from '@/features/business/me';
import { isFailed, loadError } from '@/lib/offline';
import { WEEKDAYS } from '@/lib/time';
import { toast, describeError } from '@/lib/toast';

import { SpecialDaysSection } from './SpecialDaysSection';

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

interface PickerTarget {
  weekday: number;
  field: TimeEnd;
}

function HoursEditor({ initial }: { initial: DayHours[] }) {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const [days, setDays] = React.useState(initial);
  const [picker, setPicker] = React.useState<PickerTarget | null>(null);
  const [presenting, setPresenting] = React.useState(false);
  const replace = useReplaceBusinessHours({
    onSuccess: () => toast.success(t('hours.saved')),
  });

  const updateDay = (weekday: number, patch: Partial<DayHours>) =>
    setDays((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    );

  const save = () => {
    const error = validateWeek(days);
    if (error) {
      toast.blocked(
        t(`hours.errors.${error.reason}`, { day: WEEKDAYS[error.weekday] }),
      );
      return;
    }
    replace.mutate(toHoursRows(days));
  };

  return (
    <Presenter active={presenting}>
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
              picked={picker?.weekday === day.weekday ? picker.field : null}
              onToggle={(isOpen) => {
                updateDay(day.weekday, { isOpen });
                if (picker?.weekday === day.weekday) setPicker(null);
              }}
              onPick={(field) =>
                setPicker((cur) =>
                  cur?.weekday === day.weekday && cur.field === field
                    ? null
                    : { weekday: day.weekday, field },
                )
              }
              onClosePicker={() => setPicker(null)}
              onChangeTime={(field, time) =>
                updateDay(day.weekday, { [field]: time })
              }
            />
          ))}
        </Group>
        <Text className="mx-5 mt-2.5 text-subtitle text-muted-foreground">
          {t('settings.hours.hint')}
        </Text>
        <Group radius={26} className="mx-4 mt-5">
          <GroupRow
            title={t('hours.breaks.title')}
            subtitle={t('hours.breaks.subtitle')}
            accessibilityLabel={`${t('hours.breaks.title')}. ${t('hours.breaks.subtitle')}`}
            onPress={() => router.push('/settings/team')}
          />
        </Group>
        <SpecialDaysSection
          canManage={canManage}
          onPresentChange={setPresenting}
        />
      </GlassPage>
    </Presenter>
  );
}
