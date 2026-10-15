import { GroupBlock, Text, TimeField, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatTimeOfDay } from '@/lib/time';

import { TimeWheelPanel } from './TimeWheelPanel';

type End = 'start' | 'end';

/**
 * A "from - to" row of pressed-in time fields whose wheel opens under the row:
 * the board's Hours editing, for the sheets (special hours, breaks, time off).
 */
export function TimeRangeRow({
  title,
  start,
  end,
  onChange,
  showSeparator,
}: {
  /** The row's name, also used in the spoken labels ("Break", "Special hours"). */
  title: string;
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  showSeparator?: boolean;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [picked, setPicked] = React.useState<End | null>(null);
  const value = { start, end };
  return (
    <GroupBlock showSeparator={showSeparator}>
      <View className="min-h-14 flex-row items-center gap-2 px-4 py-2">
        <Text className="flex-1 text-title">{title}</Text>
        {(['start', 'end'] as const).map((field, i) => (
          <React.Fragment key={field}>
            {i === 1 ? (
              <Text
                importantForAccessibility="no"
                style={{ color: depth.colors.secondary }}
                className="text-title"
              >
                -
              </Text>
            ) : null}
            <TimeField
              value={formatTimeOfDay(value[field], false)}
              label={t(`availability.field.${field}`, {
                title,
                time: formatTimeOfDay(value[field], false),
              })}
              active={picked === field}
              onPress={() => setPicked((cur) => (cur === field ? null : field))}
            />
          </React.Fragment>
        ))}
      </View>
      {picked ? (
        <TimeWheelPanel
          title={t(`availability.pick.${picked}`, { title })}
          value={value[picked]}
          onChange={(time) => onChange({ ...value, [picked]: time })}
          onDone={() => setPicked(null)}
        />
      ) : null}
    </GroupBlock>
  );
}
