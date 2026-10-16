import { Pressable, Text } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/**
 * One quiet line under the hero status: how many bookings today. It opens
 * Reports on tap, but looks like plain text (no chevron or link styling).
 */
export function BookingsLine({ count }: { count: number }) {
  const { t } = useTranslation();
  const label =
    count === 0 ? t('today.ai.noBookings') : t('today.ai.bookings', { count });
  return (
    <View className="items-center pt-1">
      <Pressable
        onPress={() => router.navigate('/reports' as never)}
        feedback="none"
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        className="min-h-11 justify-center px-4"
      >
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-subtitle text-muted-foreground"
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
