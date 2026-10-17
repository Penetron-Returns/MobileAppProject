import { Pressable, Text, useDepth } from '@booking/ui';
import { Check, ChevronRight, Circle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SpeakButton } from '@/components/SpeakButton';

import type { ChecklistItem } from '../logic';

/**
 * One checklist item: a check or an empty circle, the title and, at the end, a
 * speaker button that reads the item aloud. The whole row is one tap.
 */
export function ChecklistRow({
  item,
  onPress,
}: {
  item: ChecklistItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const title = t(`checklist.items.${item.id}`);
  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-2">
      <Pressable
        feedback="dim"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${t(item.isDone ? 'checklist.done' : 'checklist.notDone')}`}
        className="min-h-14 min-w-0 flex-1 flex-row items-center gap-3"
      >
        {item.isDone ? (
          <Check size={24} strokeWidth={2.6} color={depth.colors.green} />
        ) : (
          <Circle size={24} strokeWidth={1.8} color={depth.colors.secondary} />
        )}
        <Text numberOfLines={2} className="min-w-0 flex-1 text-title">
          {title}
        </Text>
        <ChevronRight
          size={14}
          strokeWidth={2.8}
          color={depth.colors.secondary}
        />
      </Pressable>
      <SpeakButton text={t(`checklist.spoken.${item.id}`)} size={44} />
    </View>
  );
}
