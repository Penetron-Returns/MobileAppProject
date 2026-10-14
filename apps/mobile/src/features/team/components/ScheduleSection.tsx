import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { GroupBlock, Text, useDepth } from '@booking/ui';

/** One line of an open section: a left label and a quiet right value. */
export interface SectionLine {
  left: string;
  right: string;
}

/**
 * A row of the person card that opens in place (Working days): title and a
 * one-line summary, a chevron that turns, and the full lines underneath.
 */
export function ScheduleSection({
  title,
  summary,
  lines,
  showSeparator,
}: {
  title: string;
  summary: string;
  lines: SectionLine[];
  showSeparator?: boolean;
}) {
  const depth = useDepth();
  const [open, setOpen] = React.useState(false);
  return (
    <GroupBlock showSeparator={showSeparator}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${summary}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => (pressed ? depth.rowPressed : undefined)}
        className="min-h-[60px] flex-row items-center gap-2.5 px-4 py-2"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-title">{title}</Text>
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-subtitle text-muted-foreground"
          >
            {summary}
          </Text>
        </View>
        <ChevronRight
          size={14}
          strokeWidth={2.8}
          color={depth.colors.secondary}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? (
        <View className="px-4 pb-2">
          {lines.map((line) => (
            <View
              key={line.left}
              className="min-h-10 flex-row items-center gap-2"
            >
              <Text className="flex-1 text-title">{line.left}</Text>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-title text-muted-foreground"
              >
                {line.right}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </GroupBlock>
  );
}
