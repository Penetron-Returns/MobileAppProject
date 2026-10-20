import { GroupBlock, MonthGrid, Text, TimeField } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  WEEKDAYS_SHORT,
  formatWeekdayDayMonth,
  type ISODate,
} from '@/lib/time';

import { buildMonthView, monthOf, shiftMonth, type Month } from '../monthGrid';

/** Monday first, one letter each. */
const WEEKDAY_INITIALS = [1, 2, 3, 4, 5, 6, 0].map((d) => WEEKDAYS_SHORT[d][0]);

/**
 * A date as a pressed-in field (like a time) that opens a month grid under
 * its row. Dates before `min` cannot be picked.
 */
export function DateRow({
  title,
  value,
  today,
  min,
  onChange,
  showSeparator,
}: {
  title: string;
  value: ISODate;
  today: ISODate;
  min?: ISODate;
  onChange: (date: ISODate) => void;
  showSeparator?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Month>(() => monthOf(value));
  const view = buildMonthView({ month, selected: value, today, min });
  const shown = formatWeekdayDayMonth(value);
  return (
    <GroupBlock showSeparator={showSeparator}>
      <View className="min-h-14 flex-row items-center gap-2 px-4 py-2">
        <Text className="flex-1 text-title">{title}</Text>
        <TimeField
          value={shown}
          label={t('availability.dateField', { title, date: shown })}
          active={open}
          onPress={() => {
            setMonth(monthOf(value));
            setOpen((o) => !o);
          }}
        />
      </View>
      {open ? (
        <View className="px-4 pb-3.5">
          <MonthGrid
            title={view.title}
            weekdays={WEEKDAY_INITIALS}
            weeks={view.weeks}
            previousLabel={t('availability.previousMonth')}
            nextLabel={t('availability.nextMonth')}
            disablePrevious={!view.canGoPrevious}
            onPrevious={() => setMonth((m) => shiftMonth(m, -1))}
            onNext={() => setMonth((m) => shiftMonth(m, 1))}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
          />
        </View>
      ) : null}
    </GroupBlock>
  );
}
