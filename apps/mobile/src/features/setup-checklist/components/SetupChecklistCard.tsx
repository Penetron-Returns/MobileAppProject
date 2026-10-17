import { Pressable, Surface, Text } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { nextItem } from '../logic';
import { useOpenChecklistItem } from '../useOpenChecklistItem';
import { useSetupChecklist } from '../useSetupChecklist';
import { ChecklistRow } from './ChecklistRow';

/**
 * The "Get set up" card at the top of the Clovie tab: how far along, and the
 * next item only, so the chat below keeps its room. "See all" opens the whole
 * list. Hidden for staff, while loading and once everything is done.
 */
export function SetupChecklistCard() {
  const { t } = useTranslation();
  const checklist = useSetupChecklist();
  const open = useOpenChecklistItem(checklist.markReviewed);
  const nextId = nextItem(checklist);
  const next = checklist.items.find((i) => i.id === nextId);
  if (!checklist.isOwner || !checklist.isReady || checklist.isComplete || !next)
    return null;

  return (
    <Surface variant="raised" radius={26} className="mx-5 mb-3 overflow-hidden">
      <View className="min-h-12 flex-row items-center justify-between gap-3 px-4 pt-2">
        <Text
          role="heading"
          aria-level="2"
          className="text-title font-semibold"
        >
          {t('checklist.title')}
        </Text>
        <Pressable
          feedback="dim"
          onPress={() => router.push('/settings/get-set-up' as never)}
          accessibilityRole="button"
          accessibilityLabel={`${t('checklist.seeAll')}, ${t('checklist.progress', { done: checklist.doneCount, total: checklist.items.length })}`}
          className="min-h-11 justify-center"
        >
          <Text className="text-subtitle text-muted-foreground">
            {t('checklist.progress', {
              done: checklist.doneCount,
              total: checklist.items.length,
            })}
            {' · '}
            {t('checklist.seeAll')}
          </Text>
        </Pressable>
      </View>
      <ChecklistRow item={next} onPress={() => open(next.id)} />
    </Surface>
  );
}
