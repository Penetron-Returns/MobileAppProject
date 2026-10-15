import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { GroupBlock, Text, useDepth } from '@booking/ui';

/** One line of an open section: a left label and a quiet right value. */
export interface SectionLine {
  key: string;
  left: string;
  right: string;
  /** A quiet line under the left label (the days of a break, a note). */
  caption?: string | null;
  /** Opens the line for editing; plain text when absent. */
  onPress?: () => void;
  /** Spoken name of an editable line. */
  accessibilityLabel?: string;
}

/**
 * A row of the person card that opens in place (Working days, Breaks, Time
 * off): title and a one-line summary, a chevron that turns, the lines
 * underneath and a tint action ("Change hours", "Add a break"). The parent
 * decides which section is open, so only one is at a time.
 */
export function ScheduleSection({
  title,
  summary,
  lines,
  actionLabel,
  onAction,
  open,
  onToggle,
  showSeparator,
}: {
  title: string;
  summary: string;
  lines: SectionLine[];
  actionLabel: string;
  onAction: () => void;
  open: boolean;
  onToggle: () => void;
  showSeparator?: boolean;
}) {
  const depth = useDepth();
  return (
    <GroupBlock showSeparator={showSeparator}>
      <Pressable
        onPress={onToggle}
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
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        >
          <ChevronRight
            size={14}
            strokeWidth={2.8}
            color={depth.colors.secondary}
          />
        </View>
      </Pressable>
      {open ? (
        <View className="px-4 pb-2">
          {lines.map((line) => {
            const body = (
              <>
                <View className="min-w-0 flex-1">
                  <Text className="text-title">{line.left}</Text>
                  {line.caption ? (
                    <Text className="text-subtitle text-muted-foreground">
                      {line.caption}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-title text-muted-foreground"
                >
                  {line.right}
                </Text>
              </>
            );
            return line.onPress ? (
              <Pressable
                key={line.key}
                onPress={line.onPress}
                accessibilityRole="button"
                accessibilityLabel={
                  line.accessibilityLabel ?? `${line.left}, ${line.right}`
                }
                className="min-h-11 flex-row items-center gap-2 py-1"
              >
                {body}
              </Pressable>
            ) : (
              <View
                key={line.key}
                className="min-h-10 flex-row items-center gap-2"
              >
                {body}
              </View>
            );
          })}
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            className="min-h-11 justify-center"
          >
            <Text style={{ color: depth.colors.tint }} className="text-title">
              {actionLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </GroupBlock>
  );
}
