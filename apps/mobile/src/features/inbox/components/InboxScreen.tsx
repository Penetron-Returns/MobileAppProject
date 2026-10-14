import {
  Chips,
  EmptyState,
  ErrorState,
  Group,
  ListSkeleton,
  OfflineBanner,
  Page,
  Text,
  useDepth,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { describeError } from '@/lib/toast';
import {
  isShowingSavedCopy,
  savedCopyLabel,
  savedCopyTime,
} from '@/lib/offline';
import { useBusiness } from '@/features/business/hooks';

import { useInboxRealtime, useInboxThreads } from '../hooks';
import { filterThreads, needsReply, type InboxView } from '../logic';
import { ThreadRow } from './ThreadRow';

/** Inbox: conversations, with the ones that need a person first. */
export function InboxScreen() {
  const { t } = useTranslation();
  const depth = useDepth();
  const queryClient = useQueryClient();
  const business = useBusiness();
  const threads = useInboxThreads();
  const [view, setView] = React.useState<InboxView>('needs');
  useInboxRealtime(true);
  const updatedAt = threads.dataUpdatedAt;
  const now = React.useMemo(
    () => new Date(updatedAt || Date.now()),
    [updatedAt],
  );

  const all = threads.data ?? [];
  const needsCount = all.filter(needsReply).length;
  const shown = filterThreads(all, view);
  const timezone = business.data?.timezone;
  const isOffline = isShowingSavedCopy(threads);

  let body: React.ReactNode;
  if (threads.isError && !threads.data) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(threads.error)}
        onRetry={() => void threads.refetch()}
        isRetrying={threads.isRefetching}
      />
    );
  } else if (threads.isPending || !timezone) {
    body = <ListSkeleton />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        variant="screen"
        icon={CheckCircle2}
        title={t('inbox.empty.title')}
        description={t('inbox.empty.description')}
      />
    );
  } else {
    body = (
      <>
        <Chips
          value={view}
          onChange={setView}
          label={t('inbox.filterLabel')}
          options={[
            {
              value: 'needs',
              label: t('inbox.segments.needs', { count: needsCount }),
            },
            { value: 'all', label: t('inbox.segments.all') },
          ]}
        />
        <Group className="mt-5">
          {shown.length === 0 ? (
            <Text className="px-4 py-6 text-title text-muted-foreground">
              {t('inbox.nothingNeeds')}
            </Text>
          ) : (
            shown.map((thread, i) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                timezone={timezone}
                now={now}
                showSeparator={i > 0}
              />
            ))
          )}
        </Group>
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {view === 'needs' ? t('inbox.footerNeeds') : t('inbox.footerAll')}
        </Text>
      </>
    );
  }

  return (
    <Page
      title={t('inbox.title')}
      backLabel={t('tabs.today')}
      backFallback="/"
      onRefresh={() =>
        queryClient.refetchQueries({ queryKey: ['conversations'] })
      }
    >
      {isOffline ? (
        <OfflineBanner
          label={savedCopyLabel(
            t,
            timezone ? savedCopyTime(threads.dataUpdatedAt, timezone) : null,
          )}
        />
      ) : null}
      {body}
    </Page>
  );
}
