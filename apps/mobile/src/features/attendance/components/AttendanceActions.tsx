import type { AttendanceCheckDTO, AttendanceOutcome } from '@booking/types';
import { Button, Pressable, Text, useDepth } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/** [Came] [No-show] for one question. `size` follows the card it sits in. */
export function AttendanceActions({
  check,
  size = 'lg',
  onAnswer,
}: {
  check: AttendanceCheckDTO;
  size?: 'lg' | 'default';
  onAnswer: (check: AttendanceCheckDTO, outcome: AttendanceOutcome) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const name = check.client_first_name;
  return (
    <View className="flex-row gap-2.5">
      <Button
        className="flex-1"
        size={size}
        onPress={() => onAnswer(check, 'came')}
        accessibilityLabel={t('attendance.cameLabel', { name })}
      >
        <Text className="text-title">{t('attendance.came')}</Text>
      </Button>
      <Button
        className="flex-1"
        size={size}
        variant="secondary"
        onPress={() => onAnswer(check, 'no_show')}
        accessibilityLabel={t('attendance.noShowLabel', { name })}
      >
        <Text style={{ color: depth.colors.tint }} className="text-title">
          {t('attendance.noShow')}
        </Text>
      </Button>
    </View>
  );
}

/** "3 clients to confirm", opening the grouped list. Shown when more than one is waiting. */
export function AttendanceMoreLink({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  if (count < 2) return null;
  const label = t('attendance.toConfirm', { count });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="mt-1 min-h-11 items-center justify-center"
    >
      <Text style={{ color: depth.colors.tint }} className="text-subtitle">
        {label}
      </Text>
    </Pressable>
  );
}
