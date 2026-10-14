import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { InitialsDome } from '@/components/InitialsDome';
import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

const ROW = 'min-h-16 flex-row items-center gap-3 px-4 py-2';

/** A person row inside a `Group`: dome avatar, name, one quiet line, chevron. */
export function PersonRow({
  name,
  subtitle,
  accessibilityLabel,
  showSeparator,
  onPress,
}: {
  name: string;
  subtitle?: string;
  accessibilityLabel: string;
  showSeparator?: boolean;
  onPress?: () => void;
}) {
  const depth = useDepth();
  const body = (
    <>
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-[68px] right-0 top-0 h-0.5"
        />
      ) : null}
      <InitialsDome name={name} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-title">
          {name}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            className="text-subtitle text-muted-foreground"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <ChevronRight
          size={16}
          strokeWidth={2.8}
          color={depth.colors.secondary}
        />
      ) : null}
    </>
  );
  if (!onPress) return <View className={ROW}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`${ROW} active:bg-muted`}
    >
      {body}
    </Pressable>
  );
}
