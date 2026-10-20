import { Pressable, Text, TimeWheel, useDepth } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/**
 * The picker that opens under a row (Hours board): what is being set, Done,
 * and the inline wheel.
 */
export function TimeWheelPanel({
  title,
  value,
  onChange,
  onDone,
  children,
}: {
  /** "Monday opens" */
  title: string;
  value: string;
  onChange: (time: string) => void;
  onDone: () => void;
  /** Extra content under the wheel. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="px-4 pb-3.5">
      <View className="flex-row items-center justify-between px-1 pb-1.5">
        <Text className="flex-1 text-subtitle text-muted-foreground">
          {title}
        </Text>
        <Pressable
          onPress={onDone}
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
        value={value}
        onChange={onChange}
        hourLabel={(hour) => t('hours.hour', { value: hour })}
        minuteLabel={(minutes) => t('hours.minutes', { value: minutes })}
      />
      {children}
    </View>
  );
}
