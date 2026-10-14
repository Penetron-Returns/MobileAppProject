import { useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Group } from '@/components/Group';
import { Page } from '@/components/Page';
import { EmptyState } from '@/components/States';
import { ErrorScreen } from '@/components/states/ErrorScreen';
import { ListSkeleton } from '@/components/states/ListSkeleton';
import { Text } from '@/components/ui/text';
import { useCanManage } from '@/features/business/me';
import {
  useServices,
  useStaff,
  useStaffServices,
  type StaffRow,
} from '@/features/catalog/hooks';

import { joinMeta, staffStatus, type StaffStatus } from '../lists';
import { PersonRow } from './PersonRow';
import { StaffForm } from './StaffForm';
import { TintLink } from './TintLink';

const STATUS_KEY: Record<StaffStatus, string | null> = {
  active: null,
  paused: 'settings.staffList.paused',
  inactive: 'settings.staffList.inactive',
};

export function StaffManagementScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const staff = useStaff();
  const services = useServices();
  const links = useStaffServices();
  const [editing, setEditing] = React.useState<StaffRow | 'new' | null>(null);

  const serviceIdsFor = (staffId: string) =>
    (links.data ?? [])
      .filter((l) => l.staff_id === staffId)
      .map((l) => l.service_id);

  let body: React.ReactNode;
  if (staff.isError) {
    body = (
      <ErrorScreen error={staff.error} onRetry={() => void staff.refetch()} />
    );
  } else if (staff.isPending) {
    body = <ListSkeleton rows={3} />;
  } else if (staff.data.length === 0) {
    body = <EmptyState icon={Users} title={t('staff.empty')} />;
  } else {
    body = (
      <Group className="mt-5">
        {staff.data.map((member, i) => {
          const statusKey = STATUS_KEY[staffStatus(member)];
          const subtitle = joinMeta(member.title, statusKey && t(statusKey));
          return (
            <PersonRow
              key={member.id}
              showSeparator={i > 0}
              name={member.name}
              subtitle={subtitle}
              accessibilityLabel={t('settings.staffList.open', {
                name: member.name,
                meta: subtitle || t('staff.statusActive'),
              })}
              onPress={canManage ? () => setEditing(member) : undefined}
            />
          );
        })}
      </Group>
    );
  }

  return (
    <Page
      title={t('staff.screenTitle')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {staff.data ? (
        <Text className="mx-5 mt-1 text-title text-muted-foreground">
          {t('settings.staffList.summary', { count: staff.data.length })}
        </Text>
      ) : null}
      {canManage ? (
        <TintLink
          icon={Plus}
          label={t('settings.staffList.add')}
          onPress={() => setEditing('new')}
          className="ml-5 mt-1"
        />
      ) : null}
      {body}
      {editing ? (
        <StaffForm
          staff={editing === 'new' ? null : editing}
          serviceIds={editing === 'new' ? [] : serviceIdsFor(editing.id)}
          services={(services.data ?? []).filter((s) => s.is_active)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Page>
  );
}
