import type { PlanDTO } from '@booking/types';
import { Pressable, SCALE, SPRING, Text, haptics } from '@booking/ui';
import { Check } from 'lucide-react-native';
import * as React from 'react';
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
  const selected = useSharedValue(isSelected ? 1 : 0);
  React.useEffect(() => {
    selected.value = withSpring(isSelected ? 1 : 0, {
      ...SPRING.snappy,
      duration: 260,
    });
  }, [isSelected, selected]);
  const price = formatRand(plan.price_cents);
  const count = plan.included_jobs ?? 0;
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, selected.value)),
  }));
  const radioStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, selected.value)),
    transform: [{ scale: 0.6 + 0.4 * selected.value }],
  }));
  const press = (to: number) => {
    scale.value = withSpring(to, { ...SPRING.snappy, duration: 140 });
  };
  return (
    <Animated.View style={style}>
      <Pressable
        feedback="none"
        onPress={() => {
          if (!isSelected) haptics.selection();
          onPress();
        }}
        onPressIn={() => press(SCALE.pressed)}
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
          borderWidth: 0.5,
          borderColor: c.ring,
        }}
      >
        {/* The chosen ring fades in over the hairline instead of swapping its width. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: -0.5,
              left: -0.5,
              right: -0.5,
              bottom: -0.5,
              borderRadius: 22,
              borderWidth: 2,
              borderColor: c.tint,
            },
            ringStyle,
          ]}
        />
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: c.radioOff,
          }}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: -1.5,
                left: -1.5,
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.tint,
              },
              radioStyle,
            ]}
          >
            <Check size={16} strokeWidth={3} color={c.onFill} />
          </Animated.View>
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
