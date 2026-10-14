import { useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Capsule } from '@/components/Capsule';
import { Group, GroupRow, SectionTitle } from '@/components/Group';
import { Page } from '@/components/Page';
import { EmptyState } from '@/components/States';
import { ErrorScreen } from '@/components/states/ErrorScreen';
import { ListSkeleton } from '@/components/states/ListSkeleton';
import { Text } from '@/components/ui/text';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import { useCanManage } from '@/features/business/me';
import { useServices, type ServiceRow } from '@/features/catalog/hooks';
import { formatDuration, formatMoney } from '@/lib/format';

import { existingCategories, groupByCategory, joinMeta } from '../lists';
import { ServiceForm } from './ServiceForm';
import { TintLink } from './TintLink';

export function ServicesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const services = useServices();
  const [editing, setEditing] = React.useState<ServiceRow | 'new' | null>(null);

  let body: React.ReactNode;
  if (services.isError) {
    body = (
      <ErrorScreen
        error={services.error}
        onRetry={() => void services.refetch()}
      />
    );
  } else if (services.isPending) {
    body = <ListSkeleton rows={4} />;
  } else if (services.data.length === 0) {
    body = <EmptyState icon={Sparkles} title={t('services.empty')} />;
  } else {
    body = (
      <BusinessGate>
        {(business) =>
          groupByCategory(services.data, t('services.other')).map(
            ([category, rows]) => (
              <View key={category}>
                <SectionTitle>{category}</SectionTitle>
                <Group>
                  {rows.map((service, i) => {
                    const meta = joinMeta(
                      formatDuration(service.duration_minutes),
                      formatMoney(service.price_cents, business.currency),
                    );
                    return (
                      <GroupRow
                        key={service.id}
                        showSeparator={i > 0}
                        title={service.name}
                        subtitle={meta}
                        trailing={
                          service.is_active ? undefined : (
                            <Capsule label={t('services.hidden')} />
                          )
                        }
                        onPress={
                          canManage ? () => setEditing(service) : undefined
                        }
                        accessibilityLabel={t('settings.servicesList.open', {
                          name: service.name,
                          meta: service.is_active
                            ? meta
                            : joinMeta(meta, t('services.hidden')),
                        })}
                      />
                    );
                  })}
                </Group>
              </View>
            ),
          )
        }
      </BusinessGate>
    );
  }

  return (
    <Page
      title={t('services.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {services.data ? (
        <Text className="mx-5 mt-1 text-title text-muted-foreground">
          {t('settings.servicesList.summary', { count: services.data.length })}
        </Text>
      ) : null}
      {canManage ? (
        <TintLink
          icon={Plus}
          label={t('settings.servicesList.add')}
          onPress={() => setEditing('new')}
          className="ml-5 mt-1"
        />
      ) : null}
      {body}
      {editing ? (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          categories={existingCategories(services.data ?? [])}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Page>
  );
}
