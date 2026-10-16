import {
  BlockedActionSheet,
  Button,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Page,
  Text,
  useOfflineGuard,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { useBusiness } from '@/features/business/hooks';
import { useInboxThreads } from '@/features/inbox/hooks';
import { isFailed, isShowingSavedCopy, loadError } from '@/lib/offline';
import { useIsOnline } from '@/lib/online';
import { todayISO } from '@/lib/time';
import { describeError } from '@/lib/toast';

import { useClientBook } from '../hooks';
import { buildSections, selectRecent } from '../phoneBook';
import { PhoneBookList } from './PhoneBookList';

const ADD_CLIENT = { pathname: '/new-booking', params: { mode: 'new' } };

/** Clients: a phone book. Search, the people you spoke to last, A-Z groups. */
export function ClientsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const business = useBusiness();
  const book = useClientBook();
  // Recent also reads the latest WhatsApp message; without the inbox it is bookings only.
  const inbox = useInboxThreads();
  const [search, setSearch] = React.useState('');
  const timezone = business.data?.timezone;
  const isOnline = useIsOnline();
  const isOffline = !isOnline || isShowingSavedCopy(book);
  const { guard, sheetProps } = useOfflineGuard(isOffline, () =>
    book.refetch({ throwOnError: true }),
  );

  const dataUpdatedAt = book.dataUpdatedAt;
  const now = React.useMemo(
    () => new Date(dataUpdatedAt || Date.now()),
    [dataUpdatedAt],
  );
  const clients = book.data;
  const query = search.trim();
  const sections = React.useMemo(
    () =>
      clients && timezone
        ? buildSections(clients, { query, now, timezone })
        : [],
    [clients, query, now, timezone],
  );
  const recent = React.useMemo(
    () =>
      clients && timezone
        ? selectRecent(clients, inbox.data ?? [], { now, timezone })
        : [],
    [clients, inbox.data, now, timezone],
  );
  const openClient = React.useCallback(
    (id: string) => router.push(`/clients/${id}` as never),
    [],
  );
  const refresh = React.useCallback(
    () => queryClient.refetchQueries({ type: 'active' }),
    [queryClient],
  );

  if (clients && timezone) {
    return clients.length === 0 ? (
      <Page title={t('clients.title')} isTab onRefresh={refresh}>
        <ClientsEmpty onAdd={guard(() => router.push(ADD_CLIENT as never))} />
        <BlockedActionSheet {...sheetProps} />
      </Page>
    ) : (
      <>
        <PhoneBookList
          title={t('clients.title')}
          sections={sections}
          recent={recent}
          search={search}
          onSearch={setSearch}
          isSearching={query.length > 0}
          emptyText={t('clients.empty.search', { query })}
          banner={<SavedCopyBanner query={book} timezone={timezone} />}
          today={todayISO(timezone, now)}
          onOpen={openClient}
          onRefresh={refresh}
        />
        <BlockedActionSheet {...sheetProps} />
      </>
    );
  }

  return (
    <Page title={t('clients.title')} isTab onRefresh={refresh}>
      {isFailed(business) ? (
        <ErrorState
          variant="banner"
          {...describeError(loadError(business))}
          onRetry={() => void business.refetch()}
        />
      ) : isFailed(book) ? (
        <ErrorState
          variant="banner"
          {...describeError(loadError(book))}
          onRetry={() => void book.refetch()}
          isRetrying={book.isRefetching}
        />
      ) : (
        <ListSkeleton />
      )}
      <BlockedActionSheet {...sheetProps} />
    </Page>
  );
}

/** First run: no client has booked yet. */
function ClientsEmpty({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      variant="screen"
      icon={Users}
      title={t('clients.empty.title')}
      description={t('clients.empty.description')}
      action={
        <Button size="lg" className="px-7" onPress={onAdd}>
          <Text className="text-title">{t('clients.empty.add')}</Text>
        </Button>
      }
    />
  );
}
