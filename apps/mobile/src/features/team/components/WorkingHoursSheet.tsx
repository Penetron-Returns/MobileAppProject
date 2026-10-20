import { Button, FormSheet, Group, Text, TintLink } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DayHoursRow } from '@/features/availability/components/DayHoursRow';
import { InlineAlert } from '@/features/availability/components/InlineAlert';
import { useReplaceStaffAvailability } from '@/features/availability/hooks';
import {
  businessFit,
  toRuleRows,
  validateStaffWeek,
  type DayHours,
  type TimeEnd,
} from '@/features/availability/week';
import { WEEKDAYS } from '@/lib/time';
import { toast } from '@/lib/toast';

/**
 * "Change hours": one range per weekday and an on/off switch, like the
 * business Hours, each checked against the business's hours that day. "Use
 * business hours" clears the person's own hours so they follow the business.
 */
export function WorkingHoursSheet({
  staffId,
  initial,
  business,
  inherited,
  onClose,
}: {
  staffId: string;
  initial: DayHours[];
  business: DayHours[];
  inherited: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = React.useState(initial);
  const [picker, setPicker] = React.useState<{
    weekday: number;
    field: TimeEnd;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const save = useReplaceStaffAvailability({
    onSuccess: () => {
      toast.success(t('team.hours.saved'));
      onClose();
    },
  });

  const update = (weekday: number, patch: Partial<DayHours>) => {
    setError(null);
    setDays((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    );
  };

  const noteFor = (day: DayHours) => {
    const bizDay = business.find((b) => b.weekday === day.weekday);
    const fit = businessFit(day, bizDay);
    if (fit === 'closed') {
      return t('team.hours.closedThatDay', { day: WEEKDAYS[day.weekday] });
    }
    return fit === 'outside' && bizDay
      ? t('team.hours.outside', { opens: bizDay.opens, closes: bizDay.closes })
      : null;
  };

  const submit = () => {
    const invalid = validateStaffWeek(days, business);
    if (invalid) {
      setError(
        t(`team.hours.errors.${invalid.reason}`, {
          day: WEEKDAYS[invalid.weekday],
        }),
      );
      return;
    }
    save.mutate({ staffId, rules: toRuleRows(days) });
  };

  return (
    <FormSheet
      open
      onClose={onClose}
      title={t('team.workingDays.title')}
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
        {days.map((day, i) => (
          <DayHoursRow
            key={day.weekday}
            day={day}
            label={WEEKDAYS[day.weekday]}
            editable
            showSeparator={i > 0}
            note={noteFor(day)}
            picked={picker?.weekday === day.weekday ? picker.field : null}
            onToggle={(isOpen) => {
              update(day.weekday, { isOpen });
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
              update(day.weekday, { [field]: time })
            }
          />
        ))}
      </Group>
      {error ? <InlineAlert message={error} /> : null}
      <Text className="mx-1 mt-2.5 text-subtitle text-muted-foreground">
        {t('team.hours.hint')}
      </Text>
      {inherited ? null : (
        <TintLink
          label={t('team.hours.useBusiness')}
          onPress={() => save.mutate({ staffId, rules: [] })}
          className="ml-1 mt-2"
        />
      )}
    </FormSheet>
  );
}
