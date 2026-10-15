import type { StaffTimeOffDTO } from '@booking/types';
import {
  Button,
  Chip,
  DestructiveRow,
  FormSheet,
  Group,
  GroupBlock,
  InlineInsetInput,
  SectionTitle,
  SwitchRow,
  Text,
} from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConflictsPanel } from '@/features/availability/components/ConflictsPanel';
import { DateRow } from '@/features/availability/components/DateRow';
import { InlineAlert } from '@/features/availability/components/InlineAlert';
import { TimeRangeRow } from '@/features/availability/components/TimeRangeRow';
import { useSaveTimeOff } from '@/features/availability/hooks';
import {
  TIME_OFF_REASONS,
  draftFromTimeOff,
  newTimeOffDraft,
  timeOffConflictQuery,
  toTimeOffRequest,
  validateTimeOff,
  type TimeOffDraft,
} from '@/features/availability/timeOff';
import { useConflictGuard } from '@/features/availability/useConflictGuard';
import type { ISODate } from '@/lib/time';
import { toast } from '@/lib/toast';

/**
 * Add or edit time off: a reason, a date range (one day to start with), all
 * day or a time range, and a note. Bookings it would strand are shown first
 * and are never cancelled.
 */
export function TimeOffSheet({
  staffId,
  editing,
  today,
  timezone,
  onClose,
  onRequestDelete,
}: {
  staffId: string;
  editing: StaffTimeOffDTO | null;
  today: ISODate;
  timezone: string;
  onClose: () => void;
  /** The screen confirms and deletes: dialogs cannot sit inside the sheet modal. */
  onRequestDelete: (e: StaffTimeOffDTO) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<TimeOffDraft>(() =>
    editing ? draftFromTimeOff(editing) : newTimeOffDraft(today),
  );
  const [error, setError] = React.useState<string | null>(null);
  const conflicts = useConflictGuard();
  const save = useSaveTimeOff({
    onSuccess: () => {
      toast.success(t(editing ? 'team.timeOff.updated' : 'team.timeOff.added'));
      onClose();
    },
  });
  const patch = (p: Partial<TimeOffDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...p }));
  };
  // A single day stays a single day while its date moves.
  const moveStart = (startsOn: ISODate) =>
    patch({
      startsOn,
      endsOn:
        draft.endsOn <= draft.startsOn || draft.endsOn < startsOn
          ? startsOn
          : draft.endsOn,
    });

  const submit = () => {
    const invalid = validateTimeOff(draft);
    if (invalid) {
      setError(t(`team.timeOff.errors.${invalid}`));
      return;
    }
    void conflicts.guard([timeOffConflictQuery(staffId, draft)], () =>
      save.mutate({
        id: editing?.id ?? null,
        staffId,
        body: toTimeOffRequest(draft),
      }),
    );
  };
  const busy = save.isPending || conflicts.checking;

  return (
    <FormSheet
      open
      onClose={onClose}
      title={t(editing ? 'team.timeOff.edit' : 'team.timeOff.add')}
      footer={
        conflicts.pending ? undefined : (
          <Button
            size="lg"
            onPress={submit}
            loading={busy}
            accessibilityLabel={t('common.save')}
          >
            <Text>{busy ? t('common.saving') : t('common.save')}</Text>
          </Button>
        )
      }
    >
      {conflicts.pending ? (
        <ConflictsPanel
          conflicts={conflicts.pending.conflicts}
          timezone={timezone}
          scope="time"
          busy={busy}
          onOpen={(id) => {
            onClose();
            router.push(`/bookings/${id}` as never);
          }}
          onSaveAnyway={conflicts.confirm}
          onCancel={conflicts.dismiss}
        />
      ) : (
        <>
          <SectionTitle className="mx-1 mb-2 mt-0">
            {t('team.timeOff.reason')}
          </SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {TIME_OFF_REASONS.map((reason) => (
              <Chip
                key={reason}
                variant="choice"
                label={t(`team.timeOff.reasons.${reason}`)}
                selected={draft.reason === reason}
                onPress={() => patch({ reason })}
              />
            ))}
          </View>
          <Group radius={26} className="mx-0 mt-6">
            <DateRow
              title={t('team.timeOff.from')}
              value={draft.startsOn}
              today={today}
              min={today}
              onChange={moveStart}
            />
            <DateRow
              showSeparator
              title={t('team.timeOff.to')}
              value={draft.endsOn}
              today={today}
              min={draft.startsOn}
              onChange={(endsOn) => patch({ endsOn })}
            />
            <GroupBlock showSeparator className="px-4">
              <SwitchRow
                title={t('team.timeOff.allDay')}
                checked={draft.allDay}
                onCheckedChange={(allDay) => patch({ allDay })}
              />
            </GroupBlock>
            {draft.allDay ? null : (
              <TimeRangeRow
                showSeparator
                title={t('team.timeOff.hours')}
                start={draft.start}
                end={draft.end}
                onChange={patch}
              />
            )}
            <GroupBlock showSeparator>
              <View className="min-h-14 flex-row items-center gap-3 px-4">
                <Text className="text-title">{t('team.timeOff.note')}</Text>
                <InlineInsetInput
                  label={t('team.timeOff.note')}
                  value={draft.note}
                  onChangeText={(note) => patch({ note })}
                  placeholder={t('team.timeOff.optional')}
                  maxLength={200}
                  containerClassName="flex-1"
                />
              </View>
            </GroupBlock>
          </Group>
          {error ? <InlineAlert message={error} /> : null}
          {editing ? (
            <Group radius={26} className="mx-0 mt-6">
              <GroupBlock>
                <DestructiveRow
                  label={t('team.timeOff.delete')}
                  onPress={() => onRequestDelete(editing)}
                />
              </GroupBlock>
            </Group>
          ) : null}
        </>
      )}
    </FormSheet>
  );
}
