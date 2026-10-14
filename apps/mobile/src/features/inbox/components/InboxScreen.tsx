import { MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { Text } from '@/components/ui/text';

/** Placeholder until the Inbox (conversations, escalations) is built. */
export function InboxScreen() {
  const { t } = useTranslation();
  return (
    <Screen edges={['top', 'left', 'right']}>
      <Text
        variant="default"
        role="heading"
        className="text-large-title font-bold"
      >
        {t('inbox.title')}
      </Text>
      <EmptyState
        icon={MessageCircle}
        title={t('inbox.empty.title')}
        description={t('inbox.empty.description')}
      />
    </Screen>
  );
}
