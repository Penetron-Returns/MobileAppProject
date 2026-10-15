import type { SpecialDayDTO } from '@booking/types';
import {
  ConfirmDialog,
  Disclosure,
  ErrorState,
  Group,
  GroupBlock,
  GroupRow,
  ListSkeleton,
  Pressable,
  Text,
  useDepth,
} from '@booking/ui';
import { Plus } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useAvailabilityConfig,
  useDeleteSpecialDay,
  useUpcomingWindow,
} from '@/features/availability/hooks';
import {
  specialDayValue,
  upcomingSpecialDays,
} from '@/features/availability/specialDays';
import { isFailed, loadError } from '@/lib/offline';
import { formatWeekdayDayMonth } from '@/lib/time';
import { describeError, toast } from '@/lib/toast';

import { SpecialDaySheet } from './SpecialDaySheet';

type Editing = SpecialDayDTO | 'new' | null;

/**
 * "Holidays and special days" (Hours board): a disclosure that opens a card of
 * upcoming dates that are closed or have their own hours, with Add special
 * day. Tapping one edits it. Owners only; staff see the list.
 */
export function SpecialDaysSection({
  canManage,
  onPresentChange,
}: {
  canManage: boolean;
  /** True while the sheet is open, so the screen can shrink behind it. */
  onPresentChange: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const window = useUpcomingWindow();
  const config = useAvailabilityConfig(
    window?.from ?? '',
    window?.to ?? '',
    window !== null,
  );
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Editing>(null);
  const [deleting, setDeleting] = React.useState<SpecialDayDTO | null>(null);
  const remove = useDeleteSpecialDay({
    onSuccess: () => toast.success(t('hours.special.removed')),
  });
  React.useEffect(() => {
    onPresentChange(editing !== null);
  }, [editing, onPresentChange]);
  const days = window
    ? upcomingSpecialDays(config.data?.special_days ?? [], window.today)
    : [];

  return (
    <>
      <Disclosure
        variant="row"
        label={t('hours.special.title')}
        expanded={open}
        onPress={() => setOpen((o) => !o)}
        className="mx-5 mt-5"
      />
      {open ? (
        <>
          {isFailed(config) && !config.data ? (
            <ErrorState
              variant="banner"
              {...describeError(loadError(config))}
              onRetry={() => void config.refetch()}
            />
          ) : !config.data ? (
            <ListSkeleton rows={2} />
          ) : (
            <Group radius={26} className="mx-4 mt-1">
              {days.map((day, i) => {
                const date = formatWeekdayDayMonth(day.date);
                const value = specialDayValue(day, t('hours.closed'));
                return (
                  <GroupRow
                    key={day.id}
                    showSeparator={i > 0}
                    title={day.name}
                    subtitle={date}
                    detail={value}
                    accessibilityLabel={t('hours.special.rowLabel', {
                      name: day.name,
                      date,
                      value,
                    })}
                    onPress={canManage ? () => setEditing(day) : undefined}
                  />
                );
              })}
              {canManage ? (
                <GroupBlock showSeparator={days.length > 0}>
                  <Pressable
                    onPress={() => setEditing('new')}
                    accessibilityRole="button"
                    accessibilityLabel={t('hours.special.add')}
                    className="min-h-14 flex-row items-center gap-3 px-4 py-2"
                  >
                    <Plus
                      size={20}
                      strokeWidth={2.4}
                      color={depth.colors.tint}
                    />
                    <Text
                      style={{ color: depth.colors.tint }}
                      className="text-title"
                    >
                      {t('hours.special.add')}
                    </Text>
                  </Pressable>
                </GroupBlock>
              ) : null}
              {days.length === 0 && !canManage ? (
                <View className="min-h-14 justify-center px-4">
                  <Text className="text-title text-muted-foreground">
                    {t('hours.special.none')}
                  </Text>
                </View>
              ) : null}
            </Group>
          )}
          <Text className="mx-5 mt-2.5 text-subtitle text-muted-foreground">
            {t('hours.special.note')}
          </Text>
        </>
      ) : null}
      {editing && window ? (
        <SpecialDaySheet
          day={editing === 'new' ? null : editing}
          today={window.today}
          timezone={window.timezone}
          onClose={() => setEditing(null)}
          onRequestDelete={(day) => {
            setEditing(null);
            setDeleting(day);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleting(null)}
        title={t('hours.special.deleteDialog.title', {
          name: deleting?.name ?? '',
        })}
        description={t('hours.special.deleteDialog.description')}
        confirmLabel={t('hours.special.deleteDialog.confirm')}
        cancelLabel={t('hours.special.deleteDialog.keep')}
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
