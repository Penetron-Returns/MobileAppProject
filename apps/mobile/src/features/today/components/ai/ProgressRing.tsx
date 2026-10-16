import { Text, useDepth, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { formatMoney } from '@/lib/format';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 64;
const RADIUS = 26;
const STROKE = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FILL_MS = 1400;

/** The ring fills once on mount (no motion under reduced motion). */
function Ring({ percent }: { percent: number }) {
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? percent : 0);
  React.useEffect(() => {
    progress.value = reduceMotion
      ? percent
      : withTiming(percent, {
          duration: FILL_MS,
          easing: Easing.out(Easing.cubic),
        });
  }, [percent, reduceMotion, progress]);
  const props = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value / 100),
  }));
  const track = depth.scheme === 'dark' ? '#2A2C35' : '#E1E5EC';
  return (
    <Svg viewBox="0 0 60 60" width={SIZE} height={SIZE}>
      <Circle
        cx={30}
        cy={30}
        r={RADIUS}
        fill="none"
        stroke={track}
        strokeWidth={STROKE}
      />
      <AnimatedCircle
        cx={30}
        cy={30}
        r={RADIUS}
        fill="none"
        stroke={depth.colors.tint}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        animatedProps={props}
        transform="rotate(-90 30 30)"
      />
    </Svg>
  );
}

/**
 * The home's numbers: a ring with the share of today's bookable time that is
 * booked, "booked today" beside it, and "R amount so far · n booked by Clovie"
 * under that. Static: nothing here counts or changes after the ring fills.
 */
export function TodayNumbers({
  percent,
  revenueCents,
  currency,
  clovieBooked,
}: {
  percent: number | null;
  revenueCents: number;
  currency: string;
  clovieBooked: number;
}) {
  const { t } = useTranslation();
  const amount = formatMoney(revenueCents, currency, { decimals: false });
  return (
    <View className="flex-row items-center gap-3.5 px-5 pt-[18px]">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          percent === null
            ? t('today.ai.ring.ariaNone')
            : t('today.ai.ring.aria', { percent })
        }
        style={{ width: SIZE, height: SIZE }}
      >
        <Ring percent={percent ?? 0} />
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-title font-bold"
          >
            {percent === null ? t('today.ai.ring.none') : `${percent}%`}
          </Text>
        </View>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-title font-semibold">
          {t('today.ai.ring.label')}
        </Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="mt-0.5 text-subtitle text-muted-foreground"
        >
          {t('today.ai.numbers', { amount, count: clovieBooked })}
        </Text>
      </View>
    </View>
  );
}
