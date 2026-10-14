import {
  GroupBlock,
  IconButton,
  Pressable,
  Switch,
  Text,
  TimeField,
  TimeWheel,
  TintLink,
  useDepth,
} from '@booking/ui';
import { Plus, X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatTimeOfDay } from '@/lib/time';

import type { DayHours, TimeRange } from '../logic';

export interface PickedTime {
  index: number;
  field: keyof TimeRange;
}

interface DayHoursRowProps {
  day: DayHours;
  /** Spoken and visible weekday name. */
  label: string;
  editable: boolean;
  showSeparator?: boolean;
  /** The time whose wheel is open under this row, if any. */
  picked: PickedTime | null;
  onToggle: (isOpen: boolean) => void;
  onPick: (index: number, field: keyof TimeRange) => void;
  onClosePicker: () => void;
  onChangeTime: (index: number, field: keyof TimeRange, time: string) => void;
  onAddRange: () => void;
  onRemoveRange: (index: number) => void;
}

/**
 * One weekday of the Hours group (board: 56pt row, 92pt name, a pair of time
 * fields, the switch; the wheel opens under the row). Extra ranges (split
 * shifts) repeat the pair on further lines.
 */
export function DayHoursRow({
  day,
  label,
  editable,
  showSeparator,
  picked,
  onToggle,
  onPick,
  onClosePicker,
  onChangeTime,
  onAddRange,
  onRemoveRange,
}: DayHoursRowProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const range = picked ? day.ranges[picked.index] : undefined;
  const hasPicker = day.isOpen && picked !== null && range !== undefined;

  return (
    <GroupBlock showSeparator={showSeparator}>
      <View className="min-h-14 flex-row items-center gap-2 px-4 py-2">
        <Text className="w-[92px] text-title">{label}</Text>
        <View className="min-w-0 flex-1 items-end gap-1.5">
          {day.isOpen ? (
            day.ranges.map((r, index) => (
              <View key={index} className="flex-row items-center gap-1.5">
                {editable && index > 0 ? (
                  <IconButton
                    icon={X}
                    size="sm"
                    variant="plain"
                    label={t('hours.removeRange')}
                    onPress={() => onRemoveRange(index)}
                  />
                ) : null}
                {(['opens', 'closes'] as const).map((field, i) => (
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
                      value={formatTimeOfDay(r[field], false)}
                      label={t(`hours.field.${field}`, {
                        day: label,
                        time: formatTimeOfDay(r[field], false),
                      })}
                      active={picked?.index === index && picked.field === field}
                      disabled={!editable}
                      onPress={() => onPick(index, field)}
                    />
                  </React.Fragment>
                ))}
              </View>
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
      {hasPicker ? (
        <View className="px-4 pb-3.5">
          <View className="flex-row items-center justify-between px-1 pb-1.5">
            <Text className="text-subtitle text-muted-foreground">
              {t(`hours.pick.${picked.field}`, { day: label })}
            </Text>
            <Pressable
              onPress={onClosePicker}
              accessibilityRole="button"
              accessibilityLabel={t('hours.done')}
              className="min-h-11 justify-center pl-3"
            >
              <Text
                style={{ color: depth.colors.tint }}
                className="text-title font-semibold"
              >
                {t('hours.done')}
              </Text>
            </Pressable>
          </View>
          <TimeWheel
            value={range[picked.field]}
            onChange={(time) => onChangeTime(picked.index, picked.field, time)}
            hourLabel={(value) => t('hours.hour', { value })}
            minuteLabel={(value) => t('hours.minutes', { value })}
          />
          {editable ? (
            <TintLink
              icon={Plus}
              label={t('hours.addRange')}
              onPress={onAddRange}
              className="mt-1"
            />
          ) : null}
        </View>
      ) : null}
    </GroupBlock>
  );
}
