import { Text, useDepth } from '@booking/ui';
import { Volume2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

import { Halo } from './VoiceControls';
import { holdAt, startLoop } from './voiceMotion';
import { ORB_IMAGE, voiceTokens } from './voiceTokens';

/** Clovie with the board's halo: `size` is the character, the halo is 44 pt larger (22 pt each side). */
export function ClovieWithHalo({
  size,
  isLive,
  isWorking,
}: {
  size: number;
  isLive: boolean;
  isWorking: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Halo size={size + 44} inset={22} isLive={isLive} />
      <ClovieAnimated state={isWorking ? 'working' : 'default'} size={size} />
    </View>
  );
}

/** The blinking text caret (1 s cycle) while live; a solid bar otherwise, so Reduce Motion holds still. */
export function Caret({ isLive }: { isLive: boolean }) {
  const { accent } = voiceTokens(useDepth());
  const [isOn, setIsOn] = React.useState(true);
  React.useEffect(() => {
    if (!isLive) {
      setIsOn(true);
      return;
    }
    const id = setInterval(() => setIsOn((on) => !on), 500);
    return () => clearInterval(id);
  }, [isLive]);
  return (
    <View
      testID="voice-caret"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 3,
        height: 28,
        marginLeft: 3,
        borderRadius: 2,
        backgroundColor: accent,
        opacity: isOn ? 1 : 0,
      }}
    />
  );
}

/** The thinking orb: swells and brightens (`vi-orb`, 1.4 s) while live. */
export function Orb({ isLive }: { isLive: boolean }) {
  const t = useSharedValue(0.5);
  React.useEffect(() => {
    if (!isLive) {
      holdAt(t, 0.5);
      return;
    }
    startLoop(t, { from: 0, to: 1, durationMs: 1400 });
    return () => holdAt(t, 0.5);
  }, [isLive, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.8 + 0.2 * t.value,
    transform: [{ scale: 0.86 + 0.24 * t.value }],
  }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 36, height: 36 }}
    >
      <Animated.View
        testID="voice-orb"
        style={[
          {
            width: 36,
            height: 36,
            borderRadius: 18,
            experimental_backgroundImage: ORB_IMAGE,
          },
          style,
        ]}
      />
    </View>
  );
}

/** The "Reading aloud" chip at the drawer's top left (shown while the reply is being spoken). */
export function ReadingChip() {
  const { t } = useTranslation();
  const { colors, inset } = useDepth();
  return (
    <View
      testID="voice-reading-chip"
      style={[
        {
          position: 'absolute',
          left: 16,
          top: 8,
          zIndex: 3,
          height: 32,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          borderRadius: 16,
        },
        inset,
      ]}
    >
      <Volume2 size={16} strokeWidth={1.8} color={colors.secondary} />
      <Text
        style={{
          fontSize: 13,
          lineHeight: 18,
          fontWeight: '600',
          color: colors.secondary,
        }}
      >
        {t('voice.inApp.readingAloud')}
      </Text>
    </View>
  );
}
