import { Divider, Page, Surface, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useOpenChecklistItem } from '../useOpenChecklistItem';
import { useSetupChecklist } from '../useSetupChecklist';
import { WhatsAppStepCard } from './WhatsAppStepCard';
import { ChecklistRow } from './ChecklistRow';

/** Settings > Get set up: every checklist item, one tap each, with a speaker button on every row. */
export function GetSetUpScreen() {
  const { t } = useTranslation();
  const checklist = useSetupChecklist();
  const open = useOpenChecklistItem(checklist.markReviewed);
  const whatsappPending = checklist.items.some(
    (i) => i.id === 'whatsapp' && !i.isDone,
  );
  // The card above is the way to connect, so the list starts after it.
  const rows = checklist.items.filter(
    (i) => !(whatsappPending && i.id === 'whatsapp'),
  );
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
      {whatsappPending ? <WhatsAppStepCard /> : null}
      <Surface
        variant="raised"
        radius={26}
        className="mx-5 mt-4 overflow-hidden"
      >
        {rows.map((item, index) => (
          <View key={item.id} className="relative">
            {index > 0 ? <Divider /> : null}
            <ChecklistRow item={item} onPress={() => open(item.id)} />
          </View>
        ))}
      </Surface>
    </Page>
  );
}
