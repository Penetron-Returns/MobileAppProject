import type { StaffBreakDTO } from '@booking/types';
import {
  Button,
  Chip,
  DestructiveRow,
  FormSheet,
  Group,
  GroupBlock,
  InlineInsetInput,
  SectionTitle,
  Text,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { InlineAlert } from '@/features/availability/components/InlineAlert';
import { TimeRangeRow } from '@/features/availability/components/TimeRangeRow';
import {
  breaksWith,
  draftFromBreak,
  newBreakDraft,
  toggleWeekday,
  validateBreak,
  type BreakDraft,
} from '@/features/availability/breaks';
import { useReplaceStaffBreaks } from '@/features/availability/hooks';
import { WEEK_ORDER } from '@/features/availability/week';
import { isApiError } from '@/lib/api';
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/time';
import { toast } from '@/lib/toast';

/**
 * Add or edit a break: a name (Lunch), a time range and the days it repeats
 * (every working day, or chosen weekdays). The endpoint replaces the whole
 * set, so the sheet sends the person's other breaks along.
 */
export function BreakSheet({
  staffId,
  existing,
  editing,
  onClose,
  onRequestDelete,
}: {
  staffId: string;
  existing: StaffBreakDTO[];
  editing: StaffBreakDTO | null;
  onClose: () => void;
  /** The screen confirms and deletes: dialogs cannot sit inside the sheet modal. */
  onRequestDelete: (b: StaffBreakDTO) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<BreakDraft>(() =>
    editing ? draftFromBreak(editing) : newBreakDraft(),
  );
  const [error, setError] = React.useState<string | null>(null);
  const save = useReplaceStaffBreaks({
    onSuccess: () => {
      toast.success(t(editing ? 'team.breaks.updated' : 'team.breaks.added'));
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.details?.rule === 'OVERLAPPING_BREAKS') {
        setError(t('team.breaks.errors.overlap'));
        return true;
      }
    },
  });
  const patch = (p: Partial<BreakDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...p }));
  };

  const submit = () => {
    const others = existing.filter((b) => b.id !== editing?.id);
    const invalid = validateBreak(draft, others);
    if (invalid) {
      setError(t(`team.breaks.errors.${invalid}`));
      return;
    }
    save.mutate({
      staffId,
      breaks: breaksWith(existing, editing?.id ?? null, draft),
    });
  };

  return (
    <FormSheet
      open
      onClose={onClose}
      title={t(editing ? 'team.breaks.edit' : 'team.breaks.add')}
      footer={
        <Button
          size="lg"
          // Saving plays its own success haptic.
          haptic={false}
          onPress={submit}
          loading={save.isPending}
          accessibilityLabel={t('common.save')}
        >
          <Text>{save.isPending ? t('common.saving') : t('common.save')}</Text>
        </Button>
      }
    >
      <Group radius={26} className="mx-0">
        <View className="min-h-14 flex-row items-center gap-3 px-4">
          <Text className="text-title">{t('team.breaks.name')}</Text>
          <InlineInsetInput
            label={t('team.breaks.name')}
            value={draft.label}
            onChangeText={(label) => patch({ label })}
            maxLength={60}
            containerClassName="flex-1"
          />
        </View>
        <TimeRangeRow
          showSeparator
          title={t('team.breaks.time')}
          start={draft.start}
          end={draft.end}
          onChange={patch}
        />
      </Group>
      <SectionTitle className="mx-1 mb-2 mt-6">
        {t('team.breaks.days')}
      </SectionTitle>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          variant="toggle"
          label={t('team.breaks.everyDay')}
          selected={draft.weekdays.length === 0}
          onPress={() => patch({ weekdays: [] })}
        />
        {WEEK_ORDER.map((d) => (
          <Chip
            key={d}
            variant="toggle"
            label={WEEKDAYS_SHORT[d]}
            accessibilityLabel={WEEKDAYS[d]}
            selected={draft.weekdays.includes(d)}
            onPress={() =>
              patch({ weekdays: toggleWeekday(draft.weekdays, d) })
            }
          />
        ))}
      </View>
      {error ? <InlineAlert message={error} /> : null}
      {editing ? (
        <Group radius={26} className="mx-0 mt-6">
          <GroupBlock>
            <DestructiveRow
              label={t('team.breaks.delete')}
              onPress={() => onRequestDelete(editing)}
            />
          </GroupBlock>
        </Group>
      ) : null}
    </FormSheet>
  );
}
