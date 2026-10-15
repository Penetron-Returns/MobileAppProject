import {
  BlockedActionSheet,
  Button,
  Chips,
  EmptyState,
  ErrorState,
  Group,
  ListSkeleton,
  Page,
  SearchField,
  SectionTitle,
  Text,
  useDepth,
  useOfflineGuard,
  Reveal,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { describeError } from '@/lib/toast';
import { isFailed, isShowingSavedCopy, loadError } from '@/lib/offline';
import { useIsOnline } from '@/lib/online';
import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { useBusiness } from '@/features/business/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { useClientList, type ClientListItem } from '../hooks';
import type { ClientFilter } from '../logic';
import { ClientRow } from './ClientRow';

const FILTERS: ClientFilter[] = ['all', 'recent', 'regulars'];
const ADD_CLIENT = { pathname: '/add', params: { mode: 'new' } };

type Translate = ReturnType<typeof useTranslation>['t'];

/** Clients: search, All / Recent / Regulars, and one tap to a profile. */
export function ClientsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const business = useBusiness();
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<ClientFilter>('all');
  const debounced = useDebouncedValue(search);
  const list = useClientList(filter, debounced);
  const clients = React.useMemo(
    () => list.data?.pages.flat() ?? [],
    [list.data],
  );
  const timezone = business.data?.timezone;
  const isOnline = useIsOnline();
  const isOffline = !isOnline || isShowingSavedCopy(list);
  const { guard, sheetProps } = useOfflineGuard(isOffline, () =>
    list.refetch({ throwOnError: true }),
  );

  const options = FILTERS.map((value) => ({
    value,
    label: t(`clients.filters.${value}`),
  }));
  const isSearching = debounced.trim().length > 0;
  const hasNoClientsAtAll =
    list.isSuccess && clients.length === 0 && filter === 'all' && !isSearching;

  return (
    <Page
      title={t('clients.title')}
      isTab
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {hasNoClientsAtAll ? (
        <ClientsEmpty
          onAdd={guard(() => router.navigate(ADD_CLIENT as never))}
        />
      ) : (
        <>
          <SearchField
            clear="cancel"
            containerClassName="mx-5 mt-3"
            value={search}
            onChangeText={setSearch}
            placeholder={t('clients.searchPlaceholder')}
            label={t('clients.searchLabel')}
            autoCorrect={false}
          />
          <Chips
            value={filter}
            onChange={setFilter}
            options={options}
            label={t('clients.filterLabel')}
          />
          <SavedCopyBanner query={list} timezone={timezone} />
          {isFailed(business) ? (
            <ErrorState
              variant="banner"
              {...describeError(loadError(business))}
              onRetry={() => void business.refetch()}
            />
          ) : list.isPending || !timezone ? (
            <ListSkeleton />
          ) : isFailed(list) && clients.length === 0 ? (
            <ErrorState
              variant="banner"
              {...describeError(loadError(list))}
              onRetry={() => void list.refetch()}
              isRetrying={list.isRefetching}
            />
          ) : (
            <ClientList
              clients={clients}
              timezone={timezone}
              title={listTitle(t, filter, isSearching, clients.length)}
              emptyText={
                isSearching
                  ? t('clients.empty.search', { query: debounced.trim() })
                  : t('clients.empty.filter')
              }
              hasMore={Boolean(list.hasNextPage)}
              isLoadingMore={list.isFetchingNextPage}
              onLoadMore={() => void list.fetchNextPage()}
            />
          )}
        </>
      )}
      <BlockedActionSheet {...sheetProps} />
    </Page>
  );
}

function listTitle(
  t: Translate,
  filter: ClientFilter,
  isSearching: boolean,
  count: number,
): string {
  if (isSearching) return t('clients.matches', { count });
  return t(`clients.listTitle.${filter}`);
}

function ClientList({
  clients,
  timezone,
  title,
  emptyText,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  clients: ClientListItem[];
  timezone: string;
  title: string;
  emptyText: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const now = React.useMemo(() => new Date(), []);
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Group>
        {clients.length === 0 ? (
          <Text className="px-4 py-6 text-title text-muted-foreground">
            {emptyText}
          </Text>
        ) : (
          clients.map((client, index) => (
            <Reveal key={client.id} scope="clients" index={index}>
              <ClientRow
                client={client}
                timezone={timezone}
                showSeparator={index > 0}
                now={now}
              />
            </Reveal>
          ))
        )}
      </Group>
      {hasMore ? (
        <Pressable
          onPress={onLoadMore}
          disabled={isLoadingMore}
          accessibilityRole="button"
          accessibilityLabel={t('clients.loadMore')}
          className="mx-5 min-h-12 justify-center px-1 active:opacity-50"
        >
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {isLoadingMore ? t('states.loading') : t('clients.loadMore')}
          </Text>
        </Pressable>
      ) : null}
    </>
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
