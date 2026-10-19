import {
  Pressable,
  SCALE,
  SPRING,
  Text,
  haptics,
  useReduceMotion,
} from '@booking/ui';
import {
  Check,
  Heart,
  Layers,
  Scissors,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BUSINESS_TYPE_IDS, type BusinessTypeId } from '../logic';
import { TYPE, useOnbColors } from '../theme';
import { ClovieReaction } from './ClovieReaction';
import { useFocusHeading } from '../useScreenReader';
import { Heading } from './Heading';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';

const ICONS: Record<BusinessTypeId, LucideIcon> = {
  barber: Scissors,
  salon: Sparkles,
  beauty: Heart,
  mix: Layers,
};

/** After the tap, the tile fills and the others dim for a beat, then the next screen follows; nothing waits on the animations. */
const ADVANCE_MS = 120;
const DIM_OPACITY = 0.6;

type TileState = 'idle' | 'picked' | 'dimmed';

function Tile({
  id,
  label,
  isSelected,
  state,
  onPress,
}: {
  id: BusinessTypeId;
  label: string;
  isSelected: boolean;
  state: TileState;
  onPress: () => void;
}) {
  const c = useOnbColors();
  const Glyph = ICONS[id];
  const scale = useSharedValue(1);
  const tick = useSharedValue(isSelected ? 1 : 0);
  const opacity = useSharedValue(1);
  const isPicked = state === 'picked';
  const press = (down: boolean) => {
    scale.value = withSpring(down || isPicked ? SCALE.pressed : 1, {
      ...SPRING.snappy,
      duration: 140,
    });
  };

  React.useEffect(() => {
    scale.value = withSpring(state === 'picked' ? SCALE.pressed : 1, {
      ...SPRING.snappy,
      duration: 140,
    });
    opacity.value = withTiming(state === 'dimmed' ? DIM_OPACITY : 1, {
      duration: 200,
    });
  }, [state, scale, opacity]);
  React.useEffect(() => {
    tick.value = withSpring(isSelected ? 1 : 0, {
      ...SPRING.bouncy,
      duration: 340,
    });
  }, [isSelected, tick]);

  const tileStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, tick.value),
    transform: [{ scale: tick.value }],
  }));

  const fg = isSelected ? c.onFill : c.label;
  return (
    <Animated.View style={[{ flex: 1 }, tileStyle]}>
      <Pressable
        feedback="none"
        onPress={onPress}
        onPressIn={() => press(true)}
        onPressOut={() => press(false)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isSelected }}
        style={{
          minHeight: 176,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingHorizontal: 8,
          paddingVertical: 16,
          backgroundColor: isSelected ? c.tint : c.surface,
          borderWidth: isSelected ? 0 : 0.5,
          borderColor: c.ring,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : c.tintWash,
          }}
        >
          <Glyph
            size={32}
            strokeWidth={1.8}
            color={isSelected ? c.onFill : c.tint}
          />
        </View>
        {/* alignSelf stretch gives the label the full tile width: on Android a
            Text inside an alignItems:center parent is measured too narrow and
            the last word ("mix") is clipped. */}
        <Text
          numberOfLines={2}
          style={[
            TYPE.tile,
            { color: fg, textAlign: 'center', alignSelf: 'stretch' },
          ]}
        >
          {label}
        </Text>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              right: 12,
              top: 12,
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.onFill,
            },
            tickStyle,
          ]}
        >
          <Check size={16} strokeWidth={3} color={c.tint} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Board 2: four big tiles, one tap advances. The tapped tile fills with blue
 * and its tick pops in, the others dim, then the name screen slides in.
 */
export function TypeScreen({
  selected,
  onSelect,
  onBack,
}: {
  selected: BusinessTypeId | null;
  onSelect: (id: BusinessTypeId) => void;
  /** Absent when there is nothing before this screen (signed in, no draft). */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const isReduced = useReduceMotion();
  const headingRef = useFocusHeading();
  const [picked, setPicked] = React.useState<BusinessTypeId | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const pick = (id: BusinessTypeId) => {
    if (picked) return;
    haptics.selection();
    setPicked(id);
    timer.current = setTimeout(() => onSelect(id), isReduced ? 0 : ADVANCE_MS);
  };

  const current = picked ?? selected;
  const rows = [BUSINESS_TYPE_IDS.slice(0, 2), BUSINESS_TYPE_IDS.slice(2, 4)];
  return (
    <OnboardingShell stage={1} onBack={onBack}>
      <View
        style={{
          flex: 1,
          alignItems: 'flex-start',
          gap: 14,
          paddingHorizontal: 20,
          paddingTop: 4,
        }}
      >
        <Rise index={0}>
          <ClovieReaction mood="curious" size={80} />
        </Rise>
        <Rise index={1}>
          <Heading headingRef={headingRef}>
            {t('onboarding.type.title')}
          </Heading>
        </Rise>
        <View
          accessibilityLabel={t('onboarding.typeLabel')}
          style={{ alignSelf: 'stretch', gap: 12, marginTop: 8 }}
        >
          {rows.map((row, r) => (
            <Rise
              key={r}
              index={2 + r}
              style={{ flexDirection: 'row', gap: 12 }}
            >
              {row.map((id) => (
                <Tile
                  key={id}
                  id={id}
                  label={t(`onboarding.types.${id}`)}
                  isSelected={current === id}
                  state={
                    picked ? (picked === id ? 'picked' : 'dimmed') : 'idle'
                  }
                  onPress={() => pick(id)}
                />
              ))}
            </Rise>
          ))}
        </View>
      </View>
    </OnboardingShell>
  );
}
