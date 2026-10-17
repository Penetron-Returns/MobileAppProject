import { Divider, Page, Surface, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useOpenChecklistItem } from '../useOpenChecklistItem';
import { useSetupChecklist } from '../useSetupChecklist';
import { ChecklistRow } from './ChecklistRow';

/** Settings > Get set up: every checklist item, one tap each, with a speaker button on every row. */
export function GetSetUpScreen() {
  const { t } = useTranslation();
  const checklist = useSetupChecklist();
  const open = useOpenChecklistItem(checklist.markReviewed);
  return (
    <Page
      title={t('checklist.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
    >
      <Text className="mx-5 mt-3 text-title text-muted-foreground">
        {checklist.isComplete
          ? t('checklist.allDone')
          : t('checklist.progress', {
              done: checklist.doneCount,
              total: checklist.items.length,
            })}
      </Text>
      <Surface
        variant="raised"
        radius={26}
        className="mx-5 mt-4 overflow-hidden"
      >
        {checklist.items.map((item, index) => (
          <View key={item.id} className="relative">
            {index > 0 ? <Divider /> : null}
            <ChecklistRow item={item} onPress={() => open(item.id)} />
          </View>
        ))}
      </Surface>
    </Page>
  );
}
