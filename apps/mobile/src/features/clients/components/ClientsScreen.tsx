import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Chips } from '@/components/Chips';
import { Group, SectionTitle } from '@/components/Group';
import { Page } from '@/components/Page';
import { Surface } from '@/components/Surface';
import { BlockedActionSheet } from '@/components/states/BlockedActionSheet';
import { ErrorScreen } from '@/components/states/ErrorScreen';
import { ListSkeleton } from '@/components/states/ListSkeleton';
import { OfflineBanner } from '@/components/states/OfflineBanner';
import { isShowingSavedCopy, savedCopyTime } from '@/components/states/offline';
import { useOfflineGuard } from '@/components/states/useOfflineGuard';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useBusiness } from '@/features/business/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDepth } from '@/hooks/useDepth';

import { useClientList, type ClientListItem } from '../hooks';
import type { ClientFilter } from '../logic';
import { ClientRow } from './ClientRow';
import { ClientSearch } from './ClientSearch';

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
  const isOffline = isShowingSavedCopy(list);
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
          <ClientSearch value={search} onChangeText={setSearch} />
          <Chips
            value={filter}
            onChange={setFilter}
            options={options}
            label={t('clients.filterLabel')}
          />
          {isOffline ? (
            <OfflineBanner
              lastUpdated={
                timezone ? savedCopyTime(list.dataUpdatedAt, timezone) : null
              }
            />
          ) : null}
          {business.isError ? (
            <ErrorScreen
              error={business.error}
              onRetry={() => void business.refetch()}
            />
          ) : list.isPending || !timezone ? (
            <ListSkeleton />
          ) : list.isError && clients.length === 0 ? (
            <ErrorScreen
              error={list.error}
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
            <ClientRow
              key={client.id}
              client={client}
              timezone={timezone}
              showSeparator={index > 0}
              now={now}
            />
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
  const depth = useDepth();
  return (
    <View className="items-center px-10 pt-24">
      <Surface
        variant="dome"
        radius={32}
        className="h-16 w-16 items-center justify-center"
      >
        <Users size={30} strokeWidth={1.8} color={depth.colors.secondary} />
      </Surface>
      <Text
        role="heading"
        aria-level="2"
        className="mt-4 text-center text-section font-bold"
      >
        {t('clients.empty.title')}
      </Text>
      <Text className="mt-1.5 text-center text-title text-muted-foreground">
        {t('clients.empty.description')}
      </Text>
      <Button size="lg" className="mt-6 px-7" onPress={onAdd}>
        <Text className="text-title">{t('clients.empty.add')}</Text>
      </Button>
    </View>
  );
}
