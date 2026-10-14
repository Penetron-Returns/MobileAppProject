import { ChevronLeft } from 'lucide-react-native';
import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../components/IconButton';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { withAlpha } from '../tokens/depth';

/** Top layer height of the design (back + progress sit inside it). */
const TOP_LAYER = 106;
const BACK_SIZE = 38;
const BOTTOM_LAYER = 190;

/** Solid colour fading to transparent: stands in for the design's blurred edge. */
function fade(color: string, direction: 'down' | 'up'): ViewStyle {
  const clear = withAlpha(color, 0);
  const stops =
    direction === 'down'
      ? `${color} 0%, ${color} 72%, ${clear} 100%`
      : `${clear} 0%, ${color} 55%, ${color} 100%`;
  return {
    backgroundColor: 'transparent',
    experimental_backgroundImage: `linear-gradient(180deg, ${stops})`,
  };
}

/**
 * Chrome for a multi-step flow: a back button and a progress bar pinned over
 * the scrolling content. Generic (value / max); knows nothing about steps.
 */
export function FlowTopBar({
  value,
  max,
  progressLabel,
  showBack,
  backLabel = 'Back',
  onBack,
}: {
  value: number;
  max: number;
  progressLabel: string;
  showBack: boolean;
  backLabel?: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const depth = useDepth();
  const top = insets.top + 11;
  const fraction = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: insets.top + TOP_LAYER - 54,
          },
          fade(depth.ground.backgroundColor as string, 'down'),
        ]}
      />
      {showBack ? (
        <View style={{ position: 'absolute', left: 12, top }}>
          <IconButton
            icon={ChevronLeft}
            label={backLabel}
            onPress={onBack}
            size="sm"
          />
        </View>
      ) : null}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={progressLabel}
        accessibilityValue={{ min: 0, max, now: value }}
        style={[
          depth.inset,
          {
            position: 'absolute',
            left: 62,
            right: 24,
            top: top + (BACK_SIZE - 6) / 2,
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
          },
        ]}
      >
        <View
          style={[
            depth.primary,
            { width: `${fraction * 100}%`, height: 6, borderRadius: 3 },
          ]}
        />
      </View>
    </>
  );
}

/** Bottom action area pinned over the content, with a fade behind it. */
export function FlowFooter({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const depth = useDepth();
  const bottom = Math.max(insets.bottom, 24);
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: BOTTOM_LAYER,
          },
          fade(depth.ground.backgroundColor as string, 'up'),
        ]}
      />
      <View
        style={{ position: 'absolute', left: 20, right: 20, bottom }}
        className="w-full max-w-2xl self-center"
      >
        {children}
      </View>
    </>
  );
}

/** Large title with an optional secondary line (design: 34/41 and 17/22). */
export function FlowHeading({
  title,
  subtitle,
  align = 'left',
}: {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}) {
  const depth = useDepth();
  return (
    <View className={align === 'center' ? 'items-center' : undefined}>
      <Text
        role="heading"
        aria-level="1"
        className={`text-large-title font-bold ${align === 'center' ? 'text-center' : ''}`}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{ color: depth.colors.secondary }}
          className={`text-title mt-1.5 ${align === 'center' ? 'text-center' : ''}`}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Small secondary helper text under a group (13/18). */
export function FlowCaption({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{ color: useDepth().colors.secondary }}
      className="text-meta mx-5 mt-2"
    >
      {children}
    </Text>
  );
}
