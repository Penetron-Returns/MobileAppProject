import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronDown, Plus, Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SearchInput } from '@/components/SearchInput';
import { EmptyState, ErrorState, LoadingRows } from '@/components/States';
import { TabHeader } from '@/components/TabHeader';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import type { BusinessSummary } from '@/features/business/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import { useClientList } from '../hooks';
import type { ClientFilter } from '../logic';
import { ClientRow } from './ClientRow';

const FILTERS: ClientFilter[] = ['all', 'recent', 'vip'];

export function ClientsScreen() {
  const queryClient = useQueryClient();
  return (
    <Screen
      header={<TabHeader />}
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      <BusinessGate>
        {(business) => <ClientsContent business={business} />}
      </BusinessGate>
    </Screen>
  );
}

function ClientsContent({ business }: { business: BusinessSummary }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<ClientFilter>('all');
  const debouncedSearch = useDebouncedValue(search);
  const list = useClientList(filter, debouncedSearch);
  const clients = list.data?.pages.flat() ?? [];

  return (
    <View className="mx-auto w-full max-w-lg gap-5 pb-8 sm:max-w-2xl md:max-w-4xl">
      <View className="flex-row items-end justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-foreground text-2xl font-bold sm:text-3xl">
            {t('clients.title')}
          </Text>
          <Text className="text-muted-foreground mt-0.5 text-sm">
            {t('clients.subtitle')}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            router.push({ pathname: '/add', params: { mode: 'new' } } as never)
          }
          accessibilityRole="button"
          accessibilityLabel={t('clients.addNew')}
          className="bg-primary min-h-[44px] flex-row items-center gap-1.5 rounded-lg px-4 py-2.5 shadow-sm active:opacity-90"
        >
          <Icon as={Plus} size={18} className="text-primary-foreground" />
          <Text className="text-primary-foreground text-sm font-semibold">
            {t('clients.new')}
          </Text>
        </Pressable>
      </View>

      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('clients.searchPlaceholder')}
        containerClassName="rounded-xl border-border bg-card shadow-sm"
      />

      <View className="flex-row gap-2">
        {FILTERS.map((id) => {
          const isActive = filter === id;
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={cn(
                'min-h-[36px] justify-center rounded-full border px-4 py-1.5',
                isActive
                  ? 'border-primary/20 bg-primary/10'
                  : 'border-border bg-card active:bg-muted',
              )}
            >
              <Text
                className={cn(
                  'text-xs font-semibold',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {t(`clients.filters.${id}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {list.isPending ? (
        <LoadingRows count={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : clients.length === 0 ? (
        <View className="bg-card border-border rounded-xl border">
          <EmptyState
            icon={Users}
            title={t('clients.empty.title')}
            description={
              debouncedSearch.trim()
                ? t('clients.empty.search', { query: debouncedSearch.trim() })
                : t('clients.empty.filter')
            }
          />
        </View>
      ) : (
        <View className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
          {clients.map((client, index) => (
            <ClientRow
              key={client.id}
              client={client}
              timezone={business.timezone}
              isLast={index === clients.length - 1}
            />
          ))}
        </View>
      )}

      {list.hasNextPage ? (
        <View className="flex-row justify-center pt-1">
          <Pressable
            onPress={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            accessibilityRole="button"
            accessibilityLabel={t('clients.loadMore')}
            className="min-h-[44px] flex-row items-center gap-1 py-2 active:opacity-70"
          >
            <Text className="text-primary text-sm font-semibold">
              {t('clients.loadMore')}
            </Text>
            <Icon as={ChevronDown} size={18} className="text-primary" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
