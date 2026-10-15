import { GroupBlock, Switch, Text, TimeField, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatTimeOfDay } from '@/lib/time';

import type { DayHours, TimeEnd } from '../week';
import { TimeWheelPanel } from './TimeWheelPanel';

interface DayHoursRowProps {
  day: DayHours;
  /** Spoken and visible weekday name. */
  label: string;
  editable: boolean;
  showSeparator?: boolean;
  /** The time whose wheel is open under this row, if any. */
  picked: TimeEnd | null;
  /** A quiet line under the row (a person's hours outside the business's). */
  note?: string | null;
  onToggle: (isOpen: boolean) => void;
  onPick: (field: TimeEnd) => void;
  onClosePicker: () => void;
  onChangeTime: (field: TimeEnd, time: string) => void;
}

/**
 * One weekday of the Hours group (board: 56pt row, 92pt name, a pair of time
 * fields, the switch; the wheel opens under the row). One range per day: a
 * lunch gap is a break, not a second range.
 */
export function DayHoursRow({
  day,
  label,
  editable,
  showSeparator,
  picked,
  note,
  onToggle,
  onPick,
  onClosePicker,
  onChangeTime,
}: DayHoursRowProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const hasPicker = day.isOpen && picked !== null;

  return (
    <GroupBlock showSeparator={showSeparator}>
      <View className="min-h-14 flex-row items-center gap-2 px-4 py-2">
        <Text className="w-[92px] text-title">{label}</Text>
        <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
          {day.isOpen ? (
            (['opens', 'closes'] as const).map((field, i) => (
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
                  value={formatTimeOfDay(day[field], false)}
                  label={t(`hours.field.${field}`, {
                    day: label,
                    time: formatTimeOfDay(day[field], false),
                  })}
                  active={picked === field}
                  disabled={!editable}
                  onPress={() => onPick(field)}
                />
              </React.Fragment>
            ))
          ) : (
            <Text className="text-title text-muted-foreground">
              {t('hours.closed')}
            </Text>
          )}
        </View>
        <Switch
          checked={day.isOpen}
          onCheckedChange={onToggle}
          disabled={!editable}
          accessibilityLabel={t('hours.toggle', { day: label })}
        />
      </View>
      {note ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: depth.colors.destructiveText }}
          className="px-4 pb-2.5 text-subtitle"
        >
          {note}
        </Text>
      ) : null}
      {hasPicker ? (
        <TimeWheelPanel
          title={t(`hours.pick.${picked}`, { day: label })}
          value={day[picked]}
          onChange={(time) => onChangeTime(picked, time)}
          onDone={onClosePicker}
        />
      ) : null}
    </GroupBlock>
  );
}
