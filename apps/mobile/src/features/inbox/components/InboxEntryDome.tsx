import { InboxDome } from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useInboxEntry } from '../useInboxEntry';

/** The Inbox dome above the tab bar: shown only when the plan has an Inbox, with the open-escalation count. */
export function InboxEntryDome() {
  const { t } = useTranslation();
  const { isVisible, unreadCount } = useInboxEntry();
  if (!isVisible) return null;
  return (
    <InboxDome
      count={unreadCount}
      label={t('inbox.domeLabel', { count: unreadCount })}
      onPress={() => router.navigate('/inbox' as never)}
    />
  );
}
