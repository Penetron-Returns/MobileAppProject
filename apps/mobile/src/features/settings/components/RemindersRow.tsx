import { GroupRow, OptionSheet } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useCanManage } from '@/features/business/me';

import { ExplainerStage } from '../explainers/ExplainerStage';
import { shortReminder } from '../explainers/labels';
import { formatReminders } from '../format';
import { useBookingRules, useSaveBookingRules } from '../hooks';
import { REMINDER_OPTIONS, sameOffsets } from '../rules';

/** "Reminders to clients": WhatsApp reminders sent before a booking; tap to choose when. */
export function RemindersRow({ showSeparator }: { showSeparator?: boolean }) {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const rules = useBookingRules();
  const save = useSaveBookingRules();
  const [open, setOpen] = React.useState(false);
  const title = t('settings.whatsapp.reminders');
  const offsets = rules.data?.reminder_offsets_minutes;
  const value = offsets ? formatReminders(t, offsets) : undefined;
  const selected = offsets
    ? REMINDER_OPTIONS.findIndex((o) => sameOffsets(o, offsets))
    : -1;

  return (
    <>
      <GroupRow
        showSeparator={showSeparator}
        title={title}
        subtitle={t('settings.explainers.help.reminders')}
        visual={
          <ExplainerStage
            scene="remind"
            label={offsets ? shortReminder(t, offsets) : undefined}
          />
        }
        detail={value}
        onPress={canManage && offsets ? () => setOpen(true) : undefined}
        accessibilityLabel={
          value ? t('settings.rules.change', { rule: title, value }) : title
        }
      />
      <OptionSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        options={REMINDER_OPTIONS.map((o, i) => ({
          value: String(i),
          label: formatReminders(t, o),
        }))}
        selected={selected >= 0 ? String(selected) : null}
        onSelect={(v) =>
          save.mutate({
            booking_rules: {
              reminder_offsets_minutes: REMINDER_OPTIONS[Number(v)],
            },
          })
        }
      />
    </>
  );
}
