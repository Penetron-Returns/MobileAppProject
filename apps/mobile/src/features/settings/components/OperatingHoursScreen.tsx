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

import { invalidateSchedule } from '../hooks';
import { OwnerOnlyNote } from './OwnerOnlyNote';
import { SpecialDaysSection } from './SpecialDaysSection';

interface PickerTarget {
  weekday: number;
  field: TimeEnd;
}

/**
 * Operating hours. One page for the whole life of the screen: the week fills
 * in when it arrives (and is then the owner's to edit; a later refetch never
 * overwrites it), so nothing remounts or flashes.
 */
export function OperatingHoursScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const hours = useBusinessHours();
  const [days, setDays] = React.useState<DayHours[] | null>(() =>
    hours.data ? toWeekSchedule(hours.data) : null,
  );
  const [picker, setPicker] = React.useState<PickerTarget | null>(null);
  const [presenting, setPresenting] = React.useState(false);
  const replace = useReplaceBusinessHours({
    onSuccess: () => {
      toast.success(t('hours.saved'));
      // The calendar's visible window and the live days and slots follow the hours.
      invalidateSchedule(queryClient);
    },
  });

  React.useEffect(() => {
    if (!days && hours.data) setDays(toWeekSchedule(hours.data));
  }, [days, hours.data]);

  const updateDay = React.useCallback(
    (weekday: number, patch: Partial<DayHours>) =>
      setDays((prev) =>
        prev
          ? prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d))
          : prev,
      ),
    [],
  );
  const toggle = React.useCallback(
    (weekday: number, isOpen: boolean) => {
      updateDay(weekday, { isOpen });
      setPicker((cur) => (cur?.weekday === weekday ? null : cur));
    },
    [updateDay],
  );
  const pick = React.useCallback((weekday: number, field: TimeEnd) => {
    setPicker((cur) =>
      cur?.weekday === weekday && cur.field === field
        ? null
        : { weekday, field },
    );
  }, []);
  const closePicker = React.useCallback(() => setPicker(null), []);

  const save = () => {
    if (!days) return;
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
        onRefresh={
          days
            ? undefined
            : () => queryClient.refetchQueries({ type: 'active' })
        }
        footer={
          canManage && days ? (
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
        {days ? (
          <>
            <Group radius={26} className="mx-4">
              {days.map((day, i) => (
                <WeekdayRow
                  key={day.weekday}
                  day={day}
                  editable={canManage}
                  showSeparator={i > 0}
                  picked={picker?.weekday === day.weekday ? picker.field : null}
                  onToggle={toggle}
                  onPick={pick}
                  onClosePicker={closePicker}
                  onChangeTime={updateDay}
                />
              ))}
            </Group>
            <Text className="mx-5 mt-2.5 text-subtitle text-muted-foreground">
              {t('settings.hours.hint')}
            </Text>
            <Group radius={26} className="mx-4 mt-5">
              <GroupRow
                title={t('hours.breaks.open')}
                onPress={() => router.push('/settings/team')}
              />
            </Group>
            <Text className="mx-5 mt-2.5 text-subtitle text-muted-foreground">
              {t('hours.breaks.hint')}
            </Text>
            <SpecialDaysSection
              canManage={canManage}
              onPresentChange={setPresenting}
            />
            <OwnerOnlyNote />
          </>
        ) : isFailed(hours) ? (
          <ErrorState
            variant="banner"
            {...describeError(loadError(hours))}
            onRetry={() => void hours.refetch()}
          />
        ) : (
          <ListSkeleton rows={7} />
        )}
      </GlassPage>
    </Presenter>
  );
}

interface WeekdayRowProps {
  day: DayHours;
  editable: boolean;
  showSeparator: boolean;
  picked: TimeEnd | null;
  onToggle: (weekday: number, isOpen: boolean) => void;
  onPick: (weekday: number, field: TimeEnd) => void;
  onClosePicker: () => void;
  onChangeTime: (weekday: number, patch: Partial<DayHours>) => void;
}

/** Re-renders only when its own day (or its picker) changes, not the whole week. */
const WeekdayRow = React.memo(function WeekdayRow({
  day,
  editable,
  showSeparator,
  picked,
  onToggle,
  onPick,
  onClosePicker,
  onChangeTime,
}: WeekdayRowProps) {
  const { weekday } = day;
  return (
    <DayHoursRow
      day={day}
      label={WEEKDAYS[weekday]}
      editable={editable}
      showSeparator={showSeparator}
      picked={picked}
      onToggle={(isOpen) => onToggle(weekday, isOpen)}
      onPick={(field) => onPick(weekday, field)}
      onClosePicker={onClosePicker}
      onChangeTime={(field, time) => onChangeTime(weekday, { [field]: time })}
    />
  );
});
