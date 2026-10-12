import { CheckCircle2, Clock, Plus, Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingRows } from '@/components/States';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useCanManage } from '@/features/business/me';
import {
  useSaveStaff,
  useServices,
  useStaff,
  useStaffServices,
  type StaffRow,
} from '@/features/catalog/hooks';
import { cn } from '@/lib/utils';

import { StaffForm } from './StaffForm';

export function StaffManagementScreen() {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const staff = useStaff();
  const services = useServices();
  const links = useStaffServices();
  const [editing, setEditing] = React.useState<StaffRow | 'new' | null>(null);
  const toggleBookings = useSaveStaff();

  const serviceIdsFor = (staffId: string) =>
    (links.data ?? [])
      .filter((l) => l.staff_id === staffId)
      .map((l) => l.service_id);

  return (
    <Screen
      header={
        <Header title={t('staff.screenTitle')} fallbackHref="/settings" />
      }
    >
      <View className="mx-auto w-full max-w-2xl gap-5 pb-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-foreground text-lg font-bold">
              {t('staff.directory')}
            </Text>
            <Text className="text-muted-foreground mt-0.5 text-sm">
              {t('staff.directoryHint')}
            </Text>
          </View>
          {canManage ? (
            <Pressable
              onPress={() => setEditing('new')}
              accessibilityRole="button"
              accessibilityLabel={t('staff.add')}
              className="bg-primary min-h-[44px] flex-row items-center gap-1.5 rounded-lg px-4 py-2.5 shadow-sm active:opacity-90"
            >
              <Icon as={Plus} size={18} className="text-primary-foreground" />
              <Text className="text-primary-foreground text-xs font-bold uppercase tracking-wider">
                {t('staff.add')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {staff.isPending ? (
          <LoadingRows count={3} />
        ) : staff.isError ? (
          <ErrorState
            error={staff.error}
            onRetry={() => void staff.refetch()}
          />
        ) : staff.data.length === 0 ? (
          <EmptyState icon={Users} title={t('staff.empty')} />
        ) : (
          <View className="gap-3">
            {staff.data.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => canManage && setEditing(member)}
                accessibilityRole="button"
                accessibilityLabel={member.name}
                className={cn(
                  'bg-card border-border relative flex-row items-center gap-3.5 overflow-hidden rounded-xl border p-4 shadow-sm active:border-primary',
                  !member.is_active && 'opacity-75',
                )}
              >
                <View
                  className={cn(
                    'absolute bottom-0 left-0 top-0 w-1',
                    member.is_active ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                />
                <PersonAvatar
                  name={member.name}
                  imageUrl={member.photo_url}
                  size="lg"
                />
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-foreground text-base font-bold"
                    numberOfLines={1}
                  >
                    {member.name}
                  </Text>
                  {member.title ? (
                    <Text
                      className="text-muted-foreground text-sm"
                      numberOfLines={1}
                    >
                      {member.title}
                    </Text>
                  ) : null}
                  <View className="mt-1 flex-row items-center gap-1">
                    <Icon
                      as={member.is_active ? CheckCircle2 : Clock}
                      size={14}
                      className={
                        member.is_active
                          ? 'text-whatsapp'
                          : 'text-muted-foreground'
                      }
                    />
                    <Text
                      className={cn(
                        'text-xs',
                        member.is_active
                          ? 'text-whatsapp font-semibold'
                          : 'text-muted-foreground font-medium',
                      )}
                    >
                      {t(
                        member.is_active
                          ? 'staff.statusActive'
                          : 'staff.statusInactive',
                      )}
                    </Text>
                  </View>
                </View>
                <View className="items-end justify-center pl-2">
                  <Text className="text-muted-foreground mb-1.5 text-xs font-medium">
                    {t('staff.bookings')}
                  </Text>
                  <Switch
                    checked={member.accepts_bookings}
                    disabled={!canManage || toggleBookings.isPending}
                    onCheckedChange={(accepts_bookings) =>
                      toggleBookings.mutate({
                        id: member.id,
                        body: { accepts_bookings },
                      })
                    }
                    accessibilityLabel={t('staff.toggleBookings', {
                      name: member.name,
                    })}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {editing ? (
        <StaffForm
          staff={editing === 'new' ? null : editing}
          serviceIds={editing === 'new' ? [] : serviceIdsFor(editing.id)}
          services={(services.data ?? []).filter((s) => s.is_active)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}
