import { BlurView } from 'expo-blur';
import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { RADII } from '../tokens/radii';
import { goBack } from './navigation';
import { useDsText } from '../lib/strings';

export interface BackPillProps {
  /** Visible and spoken text; defaults to "Back". */
  label?: string;
  /** Where back goes when there is no history. */
  fallback?: string;
  /** Overrides the default navigation (a flow stepping back inside itself). */
  onPress?: () => void;
  /**
   * `knob` is the raised pill of the large-title screens; `glass` the frosted
   * 38pt pill of the glass-nav screens (settings sub-screens).
   */
  variant?: 'knob' | 'glass';
}

/** The "< Label" pill at the top left of a pushed screen. */
export function BackPill({
  label,
  fallback,
  onPress,
  variant = 'knob',
}: BackPillProps) {
  const t = useDsText();
  const depth = useDepth();
  const text = label ?? t('common.back');
  const isGlass = variant === 'glass';
  return (
    <Pressable
      onPress={onPress ?? (() => goBack(fallback))}
      feedback={isGlass ? 'dim' : 'none'}
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={6}
      className={
        isGlass
          ? 'min-h-11 justify-center self-start'
          : 'ml-3 min-h-11 justify-center self-start'
      }
    >
      {({ pressed }) =>
        isGlass ? (
          <View
            style={[depth.glass, { borderWidth: 0.5, borderRadius: 19 }]}
            className="h-[38px] flex-row items-center gap-0.5 overflow-hidden pl-2 pr-3.5"
          >
            <BlurView
              intensity={40}
              tint={
                depth.scheme === 'dark'
                  ? 'systemThinMaterialDark'
                  : 'systemThinMaterialLight'
              }
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <ChevronLeft
              size={22}
              strokeWidth={2.4}
              color={depth.colors.tint}
            />
            <Text style={{ color: depth.colors.tint }} className="text-title">
              {text}
            </Text>
          </View>
        ) : (
          <View
            style={[
              depth.knob,
              pressed && depth.buttonPressed,
              { borderRadius: RADII.pill },
            ]}
            className="h-10 flex-row items-center gap-0.5 pl-2 pr-4"
          >
            <ChevronLeft
              size={22}
              strokeWidth={2.4}
              color={depth.colors.tint}
            />
            <Text style={{ color: depth.colors.tint }} className="text-title">
              {text}
            </Text>
          </View>
        )
      }
    </Pressable>
  );
}
