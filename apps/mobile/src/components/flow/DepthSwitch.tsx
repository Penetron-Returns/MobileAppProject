import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

const TRACK_W = 51;
const TRACK_H = 31;
const KNOB = 27;

const ON_BG = '#34C759';
const ON_GRADIENT = 'linear-gradient(180deg, #3BD16F 0%, #2DB45B 100%)';
const ON_SHADOW =
  'inset 0 1px 2px rgba(0,0,0,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.08)';

/** The design's 51x31 pill switch (green when on, pressed-in track when off). */
export function DepthSwitch({
  checked,
  onCheckedChange,
  accessibilityLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  accessibilityLabel: string;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={() => onCheckedChange(!checked)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      style={[
        checked
          ? {
              backgroundColor: ON_BG,
              experimental_backgroundImage: ON_GRADIENT,
              boxShadow: ON_SHADOW,
            }
          : depth.inset,
        { width: TRACK_W, height: TRACK_H, borderRadius: 16 },
      ]}
    >
      <View
        style={[
          depth.knob,
          {
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: KNOB,
            height: KNOB,
            borderRadius: 14,
          },
        ]}
      />
    </Pressable>
  );
}

/**
 * A flat list row: title and detail on the left, an optional control (for
 * example a price field) and a switch on the right. The text and control dim
 * when the switch is off.
 */
export function SwitchRow({
  title,
  detail,
  checked,
  onCheckedChange,
  switchLabel,
  minHeight = 56,
  control,
}: {
  title: string;
  detail?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchLabel: string;
  minHeight?: number;
  control?: React.ReactNode;
}) {
  const depth = useDepth();
  return (
    <View style={{ minHeight }} className="flex-row items-center gap-3 py-1.5">
      <View className="min-w-0 flex-1" style={{ opacity: checked ? 1 : 0.4 }}>
        <Text className="text-title">{title}</Text>
        {detail ? (
          <Text
            style={{ color: depth.colors.secondary }}
            className="text-subtitle"
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {control ? (
        <View style={{ opacity: checked ? 1 : 0.4 }}>{control}</View>
      ) : null}
      <DepthSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        accessibilityLabel={switchLabel}
      />
    </View>
  );
}
