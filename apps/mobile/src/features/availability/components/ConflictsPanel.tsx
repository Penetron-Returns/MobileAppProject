import type { AppointmentDTO } from '@booking/types';
import { Button, Group, GroupRow, Text, useDepth } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { businessDate } from '@/lib/time';

import { conflictLine } from '../conflicts';
import { useConflictNames } from '../hooks';

/**
 * The bookings a change would strand, shown before saving: the change never
 * cancels or moves them. Tap a booking to open it; Save anyway keeps them.
 */
export function ConflictsPanel({
  conflicts,
  timezone,
  scope,
  busy,
  onOpen,
  onSaveAnyway,
  onCancel,
}: {
  conflicts: AppointmentDTO[];
  timezone: string;
  /** `day` = one date ("that day"), `time` = a stretch of time off. */
  scope: 'day' | 'time';
  busy: boolean;
  onOpen: (appointmentId: string) => void;
  onSaveAnyway: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const names = useConflictNames(conflicts.map((a) => a.id));
  const dates = new Set(
    conflicts.map((a) => businessDate(a.starts_at, timezone)),
  );
  return (
    <View accessibilityLiveRegion="polite">
      <Text
        role="heading"
        aria-level="2"
        className="mx-1 text-section font-bold"
      >
        {t(`availability.conflicts.${scope}Title`, { count: conflicts.length })}
      </Text>
      <Text
        style={{ color: depth.colors.secondary }}
        className="mx-1 mb-4 mt-1 text-subtitle"
      >
        {t('availability.conflicts.body')}
      </Text>
      <Group radius={22} className="mx-0">
        {conflicts.map((a, i) => {
          const line = conflictLine(
            a,
            names.get(a.id),
            timezone,
            dates.size > 1,
          );
          return (
            <GroupRow
              key={a.id}
              showSeparator={i > 0}
              title={line}
              accessibilityLabel={t('availability.conflicts.open', {
                booking: line,
              })}
              onPress={() => onOpen(a.id)}
            />
          );
        })}
      </Group>
      <Button
        size="lg"
        onPress={onSaveAnyway}
        loading={busy}
        className="mt-6"
        accessibilityLabel={t('availability.conflicts.saveAnyway')}
      >
        <Text>{t('availability.conflicts.saveAnyway')}</Text>
      </Button>
      <Button
        size="lg"
        variant="secondary"
        onPress={onCancel}
        disabled={busy}
        className="mt-3"
        accessibilityLabel={t('common.cancel')}
      >
        <Text>{t('common.cancel')}</Text>
      </Button>
    </View>
  );
}
