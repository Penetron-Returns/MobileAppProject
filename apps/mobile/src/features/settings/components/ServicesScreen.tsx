import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  GlassPage,
  Group,
  GroupRow,
  ListSkeleton,
  Presenter,
  SectionTitle,
  Text,
  TintLink,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isFailed, loadError } from '@/lib/offline';
import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { describeError, toast } from '@/lib/toast';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import { useBusiness } from '@/features/business/hooks';
import { useCanManage } from '@/features/business/me';
import {
  useDeleteService,
  useServices,
  useStaff,
  useStaffServices,
  type ServiceRow,
} from '@/features/catalog/hooks';

import {
  compactMoney,
  durationLabel,
  existingCategories,
  groupByCategory,
  joinMeta,
} from '../lists';
import { ServiceForm } from './ServiceForm';

export function ServicesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const services = useServices();
  const staff = useStaff();
  const links = useStaffServices();
  const business = useBusiness();
  const [editing, setEditing] = React.useState<ServiceRow | 'new' | null>(null);
  // The confirm lives here, outside the sheet's modal, so it is not hidden behind it.
  const [deleting, setDeleting] = React.useState<ServiceRow | null>(null);
  const remove = useDeleteService({
    onSuccess: () => toast.success(t('services.removed')),
  });

  const bookable = staff.data?.filter((s) => s.is_active) ?? null;
  const staffIdsFor = (serviceId: string) =>
    (links.data ?? [])
      .filter((l) => l.service_id === serviceId)
      .map((l) => l.staff_id);

  let body: React.ReactNode;
  if (isFailed(services)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(services))}
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
        {(biz) =>
          groupByCategory(services.data, t('services.other')).map(
            ([category, rows]) => (
              <View key={category}>
                <SectionTitle className="mt-5">{category}</SectionTitle>
                <Group>
                  {rows.map((service, i) => {
                    const meta = joinMeta(
                      durationLabel(service.duration_minutes, t),
                      compactMoney(service.price_cents, biz.currency),
                      !service.is_active && t('services.hidden'),
                    );
                    return (
                      <GroupRow
                        key={service.id}
                        showSeparator={i > 0}
                        title={service.name}
                        subtitle={meta}
                        onPress={
                          canManage ? () => setEditing(service) : undefined
                        }
                        accessibilityLabel={t('settings.servicesList.open', {
                          name: service.name,
                          meta,
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
    <Presenter active={editing !== null}>
      <GlassPage
        title={t('services.title')}
        backLabel={t('tabs.settings')}
        backFallback="/settings"
        onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
      >
        <SavedCopyBanner query={services} />
        {services.data ? (
          <Text className="mx-5 text-title text-muted-foreground">
            {t('settings.servicesList.summary', {
              count: services.data.length,
            })}
          </Text>
        ) : null}
        {canManage ? (
          <TintLink
            variant="action"
            icon={Plus}
            label={t('settings.servicesList.add')}
            onPress={() => setEditing('new')}
            className="ml-5 mt-2"
          />
        ) : null}
        {body}
      </GlassPage>
      {editing && business.data ? (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          categories={existingCategories(services.data ?? [])}
          currency={business.data.currency}
          staff={bookable && links.data ? bookable : null}
          staffIds={editing === 'new' ? [] : staffIdsFor(editing.id)}
          onClose={() => setEditing(null)}
          onDelete={() => {
            if (editing !== 'new') setDeleting(editing);
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('services.deleteDialog.title')}
        description={t('services.deleteDialog.description')}
        confirmLabel={t('services.deleteDialog.confirm')}
        cancelLabel={t('services.deleteDialog.keep')}
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </Presenter>
  );
}
