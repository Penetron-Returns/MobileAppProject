import { Surface, Text, useDepth } from '@booking/ui';
import { Check, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Tile } from './Tile';

/** The amber "Needs you · N" card: the question on top, the actions as children. */
export function NeedsCard({
  count,
  body,
  children,
}: {
  count: number;
  body: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="px-5 pt-6">
      <Surface variant="raised" radius={22} className="px-4 pb-4 pt-3.5">
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            backgroundColor: 'rgba(255,149,0,0.09)',
            borderWidth: 1,
            borderColor:
              depth.scheme === 'dark'
                ? 'rgba(255,179,64,0.38)'
                : 'rgba(230,138,0,0.36)',
          }}
        />
        <View className="flex-row items-center gap-3">
          <Tile
            tone="reminded"
            icon={TriangleAlert}
            size={40}
            iconSize={22}
            strokeWidth={2.2}
          />
          <View className="min-w-0 flex-1">
            <Text
              role="heading"
              aria-level="2"
              className="text-title font-semibold"
            >
              {t('today.ai.needs.title', { count })}
            </Text>
            <Text
              numberOfLines={2}
              className="text-subtitle text-muted-foreground"
            >
              {body}
            </Text>
          </View>
        </View>
        <View className="mt-3">{children}</View>
      </Surface>
    </View>
  );
}

/** The follow-up line ("Marked Thandi as came") that replaces the card for a moment. */
export function Confirmation({ text }: { text: string }) {
  const depth = useDepth();
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 px-5 pt-6"
    >
      <Check size={16} strokeWidth={2.4} color={depth.colors.tint} />
      <Text className="flex-1 text-subtitle">{text}</Text>
    </View>
  );
}
