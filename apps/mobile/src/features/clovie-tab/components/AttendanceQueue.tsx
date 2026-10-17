import { Button, Pressable, Surface, Text, useDepth } from '@booking/ui';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { QueueItem } from '../queue';

/**
 * The needs-you queue, one item at a time with a "N more" count. Until
 * Nerova's `CompanionMoment` takes `queueItems`, this is the owner's only
 * queue, fed by the pure mapper in `queue.ts`.
 */
export function AttendanceQueue({
  items,
  confirmation,
  onAction,
  onOpenAll,
}: {
  items: readonly QueueItem[];
  /** The follow-up line ("Marked Daniel as came") shown for a moment. */
  confirmation: string | null;
  onAction: (itemId: string, actionId: string) => void;
  onOpenAll: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [first, ...rest] = items;

  if (confirmation) {
    return (
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2 px-5 pt-4"
      >
        <Check size={16} strokeWidth={2.4} color={depth.colors.tint} />
        <Text className="flex-1 text-subtitle">{confirmation}</Text>
      </View>
    );
  }
  if (!first) return null;
  const more = t('clovieTab.moreWaiting', { count: rest.length });
  return (
    <View className="px-5 pt-4">
      <Surface variant="raised" radius={22} className="px-4 pb-4 pt-3.5">
        <Text
          role="heading"
          aria-level="2"
          className="text-title font-semibold"
        >
          {first.title}
        </Text>
        {first.detail ? (
          <Text className="text-subtitle text-muted-foreground">
            {first.detail}
          </Text>
        ) : null}
        <View className="mt-3 flex-row gap-2.5">
          {first.actions.map((action, index) => (
            <Button
              key={action.id}
              className="flex-1"
              size="lg"
              variant={index === 0 ? 'default' : 'secondary'}
              onPress={() => onAction(first.id, action.id)}
              accessibilityLabel={action.accessibilityLabel ?? action.label}
            >
              <Text
                style={index === 0 ? undefined : { color: depth.colors.tint }}
                className="text-title"
              >
                {action.label}
              </Text>
            </Button>
          ))}
        </View>
      </Surface>
      {rest.length > 0 ? (
        <Pressable
          onPress={onOpenAll}
          accessibilityRole="button"
          accessibilityLabel={more}
          className="min-h-11 items-center justify-center"
        >
          <Text style={{ color: depth.colors.tint }} className="text-subtitle">
            {more}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
