import type { SpecialDayDTO } from '@booking/types';
import {
  Button,
  DestructiveRow,
  FormSheet,
  Group,
  GroupBlock,
  Text,
} from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ConflictsPanel } from '@/features/availability/components/ConflictsPanel';
import { InlineAlert } from '@/features/availability/components/InlineAlert';
import {
  useAddSpecialDays,
  useSaveSpecialDay,
  useSpecialDaySuggestions,
} from '@/features/availability/hooks';
import {
  changesAvailability,
  draftFromSpecialDay,
  newSpecialDraft,
  pendingSuggestions,
  specialDayConflictQuery,
  suggestionRequest,
  toSpecialDayRequest,
  validateSpecialDay,
  type SpecialDayDraft,
} from '@/features/availability/specialDays';
import { useConflictGuard } from '@/features/availability/useConflictGuard';
import { isApiError } from '@/lib/api';
import { parseISODate, type ISODate } from '@/lib/time';
import { toast } from '@/lib/toast';

import { HolidaySuggestions } from './HolidaySuggestions';
import { SpecialDayFields } from './SpecialDayFields';

/**
 * Add (null) or edit a special day. New days offer the upcoming public
 * holidays first. Closing time that has bookings shows them before saving and
 * never cancels them.
 */
export function SpecialDaySheet({
  day,
  today,
  timezone,
  onClose,
  onRequestDelete,
}: {
  day: SpecialDayDTO | null;
  today: ISODate;
  timezone: string;
  onClose: () => void;
  /** The screen confirms and deletes: dialogs cannot sit inside the sheet's modal. */
  onRequestDelete: (day: SpecialDayDTO) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<SpecialDayDraft>(() =>
    day ? draftFromSpecialDay(day) : newSpecialDraft(today),
  );
  const [error, setError] = React.useState<string | null>(null);
  const conflicts = useConflictGuard();
  const year = parseISODate(today).y;
  const holidays = useSpecialDaySuggestions([year, year + 1], day === null);
  const upcoming = pendingSuggestions(holidays.suggestions, today);

  const done = (message: string) => {
    toast.success(message);
    onClose();
  };
  const save = useSaveSpecialDay({
    onSuccess: () =>
      done(t(day ? 'hours.special.updated' : 'hours.special.added')),
    onError: (e) => {
      if (isApiError(e) && e.details?.special_day_id) {
        setError(t('hours.special.errors.exists'));
        return true;
      }
    },
  });
  const addMany = useAddSpecialDays({
    onSuccess: (count) => done(t('hours.special.addedCount', { count })),
  });

  const submit = () => {
    const invalid = validateSpecialDay(draft);
    setError(invalid ? t(`hours.special.errors.${invalid}`) : null);
    if (invalid) return;
    const run = () =>
      save.mutate({ id: day?.id ?? null, body: toSpecialDayRequest(draft) });
    if (!changesAvailability(day, draft)) run();
    else void conflicts.guard([specialDayConflictQuery(draft)], run);
  };

  const addHolidays = (list: typeof upcoming) =>
    void conflicts.guard(
      list.map((s) => specialDayConflictQuery(newSpecialDraft(s.date))),
      () => addMany.mutate(list.map(suggestionRequest)),
    );

  const openBooking = (id: string) => {
    onClose();
    router.push(`/bookings/${id}` as never);
  };
  // With suggestions listed, tapping one adds it at once; the button below only
  // saves the custom form, so it says so.
  const saveLabel =
    day === null && upcoming.length > 0
      ? t('hours.special.addCustom')
      : t('common.save');
  const busy = save.isPending || addMany.isPending || conflicts.checking;

  return (
    <FormSheet
      open
      onClose={onClose}
      title={t(day ? 'hours.special.edit' : 'hours.special.add')}
      footer={
        conflicts.pending ? undefined : (
          <Button
            size="lg"
            // Saving plays its own success haptic.
            haptic={false}
            onPress={submit}
            loading={busy}
            accessibilityLabel={saveLabel}
          >
            <Text>{busy ? t('common.saving') : saveLabel}</Text>
          </Button>
        )
      }
    >
      {conflicts.pending ? (
        <ConflictsPanel
          conflicts={conflicts.pending.conflicts}
          timezone={timezone}
          scope="day"
          busy={busy}
          onOpen={openBooking}
          onSaveAnyway={conflicts.confirm}
          onCancel={conflicts.dismiss}
        />
      ) : (
        <>
          {day === null ? (
            <HolidaySuggestions
              suggestions={upcoming}
              loading={holidays.isPending}
              busy={busy}
              onAdd={(s) => addHolidays([s])}
              onAddAll={() => addHolidays(upcoming)}
            />
          ) : null}
          {day === null && (upcoming.length > 0 || holidays.isPending) ? (
            <Text
              role="heading"
              aria-level="2"
              className="mx-1 mb-2 mt-6 text-section font-bold"
            >
              {t('hours.special.custom')}
            </Text>
          ) : null}
          <SpecialDayFields
            draft={draft}
            today={today}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
          {error ? <InlineAlert message={error} /> : null}
          {day ? (
            <Group radius={26} className="mx-0 mt-6">
              <GroupBlock>
                <DestructiveRow
                  label={t('hours.special.delete')}
                  onPress={() => onRequestDelete(day)}
                />
              </GroupBlock>
            </Group>
          ) : null}
        </>
      )}
    </FormSheet>
  );
}
