import { InboxDome } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useInboxEntry } from '../useInboxEntry';

/**
 * The Inbox bubble above the tab bar. The badge counts the open escalations; it opens the Inbox.
 */
export function InboxEntryDome() {
  const { t } = useTranslation();
  const { unreadCount } = useInboxEntry();
  return (
    <InboxDome
      count={unreadCount}
      label={t('inbox.domeLabel', { count: unreadCount })}
      onPress={() => router.push('/inbox' as never)}
    />
  );
}
