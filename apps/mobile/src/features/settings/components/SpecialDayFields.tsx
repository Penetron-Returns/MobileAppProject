import {
  Group,
  GroupBlock,
  InlineInsetInput,
  SegmentedControl,
  Text,
} from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { DateRow } from '@/features/availability/components/DateRow';
import { TimeRangeRow } from '@/features/availability/components/TimeRangeRow';
import type { SpecialDayDraft } from '@/features/availability/specialDays';
import type { ISODate } from '@/lib/time';

type Mode = SpecialDayDraft['mode'];

/** The custom day: date, name, Closed or Special hours (with its time wheel). */
export function SpecialDayFields({
  draft,
  today,
  onChange,
}: {
  draft: SpecialDayDraft;
  today: ISODate;
  onChange: (patch: Partial<SpecialDayDraft>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Group radius={26} className="mx-0">
      <DateRow
        title={t('hours.special.date')}
        value={draft.date}
        today={today}
        min={today}
        onChange={(date) => onChange({ date })}
      />
      <GroupBlock showSeparator>
        <View className="min-h-14 flex-row items-center gap-3 px-4">
          <Text className="text-title">{t('hours.special.name')}</Text>
          <InlineInsetInput
            label={t('hours.special.name')}
            value={draft.name}
            onChangeText={(name) => onChange({ name })}
            placeholder={t('hours.special.namePlaceholder')}
            maxLength={80}
            containerClassName="flex-1"
          />
        </View>
      </GroupBlock>
      <GroupBlock showSeparator>
        <View className="min-h-14 flex-row items-center px-4 py-2">
          <SegmentedControl<Mode>
            variant="choice"
            label={t('hours.special.mode')}
            value={draft.mode}
            options={[
              { value: 'closed', label: t('hours.closed') },
              { value: 'hours', label: t('hours.special.hours') },
            ]}
            onChange={(mode) => onChange({ mode })}
            className="flex-1"
          />
        </View>
      </GroupBlock>
      {draft.mode === 'hours' ? (
        <TimeRangeRow
          showSeparator
          title={t('hours.special.open')}
          start={draft.start}
          end={draft.end}
          onChange={({ start, end }) => onChange({ start, end })}
        />
      ) : null}
    </Group>
  );
}
