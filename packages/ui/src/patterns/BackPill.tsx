import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

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
}

/** The raised "< Label" pill at the top left of a pushed screen. */
export function BackPill({ label, fallback, onPress }: BackPillProps) {
  const t = useDsText();
  const depth = useDepth();
  const text = label ?? t('common.back');
  return (
    <Pressable
      onPress={onPress ?? (() => goBack(fallback))}
      feedback="none"
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={6}
      className="ml-3 min-h-11 justify-center self-start"
    >
      {({ pressed }) => (
        <View
          style={[
            depth.knob,
            pressed && depth.buttonPressed,
            { borderRadius: RADII.pill },
          ]}
          className="h-10 flex-row items-center gap-0.5 pl-2 pr-4"
        >
          <ChevronLeft size={22} strokeWidth={2.4} color={depth.colors.tint} />
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {text}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
