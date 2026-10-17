import type { PlanDTO } from '@booking/types';
import { Pressable, SPRING, Text } from '@booking/ui';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { formatRand } from '@/features/plans/logic';

import { TYPE, useOnbColors } from '../theme';

/**
 * One plan of the picker: a radio card (ring and dot move to the chosen one),
 * name and allowance on the left, price on the right. It dips to .97 on a
 * 140ms spring while pressed.
 */
export function PlanCard({
  plan,
  isSelected,
  onPress,
}: {
  plan: PlanDTO;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const scale = useSharedValue(1);
  const price = formatRand(plan.price_cents);
  const count = plan.included_jobs ?? 0;
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const press = (to: number) => {
    scale.value = withSpring(to, { ...SPRING.snappy, duration: 140 });
  };
  return (
    <Animated.View style={style}>
      <Pressable
        feedback="none"
        onPress={onPress}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={t('onboarding.plan.spokenPlan', {
          name: plan.name,
          price,
          count,
        })}
        style={{
          minHeight: 80,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 22,
          backgroundColor: c.surface,
          borderWidth: isSelected ? 2 : 0.5,
          borderColor: isSelected ? c.tint : c.ring,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isSelected ? c.tint : 'transparent',
            borderWidth: isSelected ? 0 : 1.5,
            borderColor: c.radioOff,
          }}
        >
          {isSelected ? (
            <Check size={16} strokeWidth={3} color={c.onFill} />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[TYPE.tile, { color: c.label }]}>{plan.name}</Text>
          <Text style={[TYPE.sub, { color: c.secondary }]}>
            {t('onboarding.plan.bookings', { count })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={[
              TYPE.price,
              { color: c.label, fontVariant: ['tabular-nums'] },
            ]}
          >
            {price}
          </Text>
          <Text style={[TYPE.meta, { color: c.secondary }]}>
            {t('onboarding.plan.perMonth')}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
