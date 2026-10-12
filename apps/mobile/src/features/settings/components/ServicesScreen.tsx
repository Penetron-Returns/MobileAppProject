import { ChevronRight, Clock, Plus, Sparkles } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingRows } from '@/components/States';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import { useCanManage } from '@/features/business/me';
import { useServices, type ServiceRow } from '@/features/catalog/hooks';
import { formatDuration, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

import { ServiceForm } from './ServiceForm';

function groupByCategory(services: ServiceRow[], other: string) {
  const groups = new Map<string, ServiceRow[]>();
  for (const s of services) {
    const key = s.category?.trim() || other;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()];
}

export function ServicesScreen() {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const services = useServices();
  const [editing, setEditing] = React.useState<ServiceRow | 'new' | null>(null);
  const categories = [
    ...new Set(
      (services.data ?? [])
        .map((s) => s.category?.trim())
        .filter((c): c is string => !!c),
    ),
  ];

  return (
    <Screen
      header={<Header title={t('services.title')} fallbackHref="/settings" />}
      footer={
        canManage ? (
          <View className="items-center pb-2">
            <Pressable
              onPress={() => setEditing('new')}
              accessibilityRole="button"
              accessibilityLabel={t('services.add')}
              className="bg-primary h-14 w-full max-w-md flex-row items-center justify-center gap-2 rounded-full shadow-lg active:opacity-90"
            >
              <Icon as={Plus} size={20} className="text-primary-foreground" />
              <Text className="text-primary-foreground text-base font-bold">
                {t('services.add')}
              </Text>
            </Pressable>
          </View>
        ) : undefined
      }
    >
      <BusinessGate>
        {(business) =>
          services.isPending ? (
            <LoadingRows count={4} />
          ) : services.isError ? (
            <ErrorState
              error={services.error}
              onRetry={() => void services.refetch()}
            />
          ) : services.data.length === 0 ? (
            <EmptyState icon={Sparkles} title={t('services.empty')} />
          ) : (
            <View className="mx-auto w-full max-w-2xl gap-6 pb-6">
              {groupByCategory(services.data, t('services.other')).map(
                ([category, items]) => (
                  <View key={category} className="gap-2.5">
                    <Text className="text-primary px-1 text-lg font-bold">
                      {category}
                    </Text>
                    {items.map((service) => (
                      <Pressable
                        key={service.id}
                        onPress={() => canManage && setEditing(service)}
                        accessibilityRole="button"
                        accessibilityLabel={service.name}
                        className={cn(
                          'bg-card border-border flex-row items-center justify-between rounded-xl border p-4 shadow-sm active:border-primary',
                          !service.is_active && 'opacity-60',
                        )}
                      >
                        <View className="flex-1 gap-1 pr-3">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-foreground shrink text-base font-semibold">
                              {service.name}
                            </Text>
                            {!service.is_active ? (
                              <View className="bg-muted rounded-full px-2 py-0.5">
                                <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                                  {t('services.hidden')}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View className="flex-row items-center gap-2">
                            <Icon
                              as={Clock}
                              size={14}
                              className="text-muted-foreground"
                            />
                            <Text className="text-muted-foreground text-sm font-medium">
                              {formatDuration(service.duration_minutes)}
                            </Text>
                            <View className="bg-muted-foreground/30 h-1 w-1 rounded-full" />
                            <Text className="text-foreground text-sm font-bold">
                              {formatMoney(
                                service.price_cents,
                                business.currency,
                              )}
                            </Text>
                          </View>
                        </View>
                        {canManage ? (
                          <Icon
                            as={ChevronRight}
                            size={20}
                            className="text-muted-foreground"
                          />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ),
              )}
            </View>
          )
        }
      </BusinessGate>
      {editing ? (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}
