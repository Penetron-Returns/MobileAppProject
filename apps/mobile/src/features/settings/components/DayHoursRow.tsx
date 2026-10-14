import { Plus, X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { formatTimeOfDay } from '@/lib/time';

import type { DayHours, TimeRange } from '../logic';

interface DayHoursRowProps {
  day: DayHours;
  /** Spoken and visible weekday name. */
  label: string;
  editable: boolean;
  showSeparator?: boolean;
  onToggle: (isOpen: boolean) => void;
  onPick: (index: number, field: keyof TimeRange) => void;
  onAddRange: () => void;
  onRemoveRange: (index: number) => void;
}

/** One weekday inside a `Group`: name, switch, and its tappable time ranges. */
export function DayHoursRow({
  day,
  label,
  editable,
  showSeparator,
  onToggle,
  onPick,
  onAddRange,
  onRemoveRange,
}: DayHoursRowProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="px-4 py-1.5">
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-4 right-0 top-0 h-0.5"
        />
      ) : null}
      <View className="min-h-12 flex-row items-center gap-3">
        <Text className="w-28 text-title">{label}</Text>
        <View className="min-w-0 flex-1 items-end">
          {day.isOpen ? null : (
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
      {day.isOpen ? (
        <View className="pb-1">
          {day.ranges.map((range, index) => (
            <View key={index} className="min-h-11 flex-row items-center gap-1">
              <TimeLink
                value={range.opens}
                label={t('hours.pick.opens', { day: label })}
                disabled={!editable}
                onPress={() => onPick(index, 'opens')}
              />
              <Text className="text-title text-muted-foreground">
                {t('hours.to')}
              </Text>
              <TimeLink
                value={range.closes}
                label={t('hours.pick.closes', { day: label })}
                disabled={!editable}
                onPress={() => onPick(index, 'closes')}
              />
              {editable && day.ranges.length > 1 ? (
                <Pressable
                  onPress={() => onRemoveRange(index)}
                  accessibilityRole="button"
                  accessibilityLabel={t('hours.removeRange')}
                  className="h-11 w-11 items-center justify-center"
                >
                  <X
                    size={18}
                    strokeWidth={2.4}
                    color={depth.colors.secondary}
                  />
                </Pressable>
              ) : null}
            </View>
          ))}
          {editable ? (
            <Pressable
              onPress={onAddRange}
              accessibilityRole="button"
              accessibilityLabel={t('hours.addRange')}
              className="min-h-11 flex-row items-center gap-1.5 self-start"
            >
              <Plus size={18} strokeWidth={2.4} color={depth.colors.tint} />
              <Text
                style={{ color: depth.colors.tint }}
                className="text-subtitle"
              >
                {t('hours.addRange')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function TimeLink({
  value,
  label,
  disabled,
  onPress,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatTimeOfDay(value)}`}
      className="min-h-11 min-w-16 justify-center"
    >
      <Text
        style={{ color: disabled ? depth.colors.label : depth.colors.tint }}
        className="text-title"
      >
        {formatTimeOfDay(value)}
      </Text>
    </Pressable>
  );
}
