import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Calendar,
  CalendarDays,
  CalendarX,
  Clock,
  MessageCircle,
  Phone,
  Scissors,
  User,
  XCircle,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingCard } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  useAppointment,
  useCancelAppointment,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
import { useClientAppointments } from '@/features/clients/hooks';
import { clientStats, VIP_TAG } from '@/features/clients/logic';
import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { formatDuration, formatMoney, formatPhone } from '@/lib/format';
import {
  businessDate,
  formatDateMedium,
  formatDateShort,
  formatTime,
} from '@/lib/time';
import { toast } from '@/lib/toast';

export function BookingDetailScreen({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const business = useBusiness();
  const appointment = useAppointment(appointmentId);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const cancel = useCancelAppointment({
    onSuccess: () => toast.success(t('booking.cancelled')),
  });
  const data = appointment.data;
  const failed = business.isError
    ? business
    : appointment.isError
      ? appointment
      : null;

  return (
    <Screen
      header={<Header title={t('booking.title')} fallbackHref="/calendar" />}
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
      footer={
        data ? (
          <BookingActions
            appointment={data}
            isCancelling={cancel.isPending}
            onCancel={() => setCancelOpen(true)}
          />
        ) : undefined
      }
    >
      {failed ? (
        <ErrorState
          error={failed.error}
          onRetry={() => void failed.refetch()}
        />
      ) : !business.data || appointment.isPending ? (
        <LoadingCard />
      ) : !data ? (
        <EmptyState icon={CalendarX} title={t('booking.notFound')} />
      ) : (
        <BookingBody appointment={data} business={business.data} />
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('booking.cancelDialog.title')}
        description={t('booking.cancelDialog.description')}
        confirmLabel={t('booking.cancelDialog.confirm')}
        cancelLabel={t('booking.cancelDialog.keep')}
        destructive
        onConfirm={() => {
          setCancelOpen(false);
          cancel.mutate({ id: appointmentId, notify_customer: true });
        }}
      />
    </Screen>
  );
}

function BookingActions({
  appointment,
  isCancelling,
  onCancel,
}: {
  appointment: AppointmentDetail;
  isCancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const name =
    appointment.client.name ?? formatPhone(appointment.client.phone_e164);
  const isCancellable = appointment.status === 'confirmed';
  return (
    <View className="gap-2.5">
      <View className="flex-row gap-2.5">
        <OutlineButton
          icon={MessageCircle}
          label={t('booking.message')}
          onPress={() =>
            Linking.openURL(
              whatsAppChatUrl(appointment.client.phone_e164, ''),
            ).catch(() => toast.info(t('dashboard.openingWhatsApp', { name })))
          }
        />
        <OutlineButton
          icon={CalendarDays}
          label={t('booking.viewCalendar')}
          onPress={() => router.push('/calendar' as never)}
        />
      </View>
      {isCancellable ? (
        <Pressable
          onPress={onCancel}
          disabled={isCancelling}
          accessibilityRole="button"
          accessibilityLabel={t('booking.cancel')}
          className="border-destructive bg-card active:bg-destructive/5 h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border shadow-sm"
        >
          <Icon as={XCircle} size={18} className="text-destructive" />
          <Text className="text-destructive text-base font-semibold">
            {t('booking.cancel')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function OutlineButton({
  icon,
  label,
  onPress,
}: {
  icon: typeof Phone;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="border-primary bg-card active:bg-primary/5 h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border shadow-sm"
    >
      <Icon as={icon} size={18} className="text-primary" />
      <Text className="text-primary text-base font-semibold">{label}</Text>
    </Pressable>
  );
}

function BookingBody({
  appointment,
  business,
}: {
  appointment: AppointmentDetail;
  business: BusinessSummary;
}) {
  const { t } = useTranslation();
  const tz = business.timezone;
  const bookedOn = formatDateMedium(businessDate(appointment.created_at, tz));
  const timeRange = `${formatTime(appointment.starts_at, tz)} - ${formatTime(appointment.ends_at, tz)}`;
  return (
    <View className="mx-auto w-full max-w-lg gap-4 pb-4 sm:max-w-xl">
      <View className="items-center justify-center gap-2 py-2">
        <StatusBadge status={appointment.status} pill />
        <Text className="text-muted-foreground text-sm">
          {t('booking.bookedOn', {
            date: bookedOn,
            source: t(`booking.source.${appointment.source}`),
          })}
        </Text>
      </View>

      <ClientCard appointment={appointment} />

      <View className="bg-card border-border relative overflow-hidden rounded-2xl border p-4 shadow-sm">
        <View className="bg-primary/5 pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full" />
        <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
          {t('booking.schedule')}
        </Text>
        <View className="mb-2 flex-row items-center gap-2">
          <Icon as={Calendar} size={20} className="text-primary" />
          <Text className="text-foreground text-lg font-bold">
            {formatDateShort(businessDate(appointment.starts_at, tz))}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Icon as={Clock} size={20} className="text-primary" />
          <Text className="text-foreground text-xl font-bold">{timeRange}</Text>
        </View>
      </View>

      <View className="border-l-primary border-border bg-card overflow-hidden rounded-2xl border border-l-4 p-4 shadow-sm">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              {t('booking.service')}
            </Text>
            <Text className="text-foreground mt-0.5 text-lg font-bold">
              {appointment.service.name}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              {t('booking.total')}
            </Text>
            <Text className="text-foreground mt-0.5 text-lg font-bold">
              {formatMoney(appointment.price_cents, business.currency)}
            </Text>
          </View>
        </View>
        <View className="my-3 flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5">
            <Icon as={Clock} size={15} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm font-medium">
              {formatDuration(appointment.duration_minutes)}
            </Text>
          </View>
          {appointment.service.category ? (
            <>
              <View className="bg-border h-1 w-1 rounded-full" />
              <View className="flex-row items-center gap-1.5">
                <Icon
                  as={Scissors}
                  size={15}
                  className="text-muted-foreground"
                />
                <Text className="text-muted-foreground text-sm font-medium">
                  {appointment.service.category}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        <View className="bg-muted/40 border-border flex-row items-center gap-3 rounded-xl border p-3">
          <PersonAvatar
            name={appointment.staff.name}
            imageUrl={appointment.staff.photo_url}
            size="sm"
          />
          <View>
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              {t('booking.staff')}
            </Text>
            <Text className="text-foreground text-sm font-bold">
              {appointment.staff.name}
            </Text>
          </View>
        </View>
      </View>

      {appointment.notes ? (
        <View className="bg-card border-border rounded-2xl border p-4 shadow-sm">
          <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            {t('booking.notes')}
          </Text>
          <View className="bg-muted/40 border-border rounded-xl border p-3.5">
            <Text className="text-muted-foreground text-sm italic leading-5">
              &ldquo;{appointment.notes}&rdquo;
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ClientCard({ appointment }: { appointment: AppointmentDetail }) {
  const { t } = useTranslation();
  const router = useRouter();
  const client = appointment.client;
  const name = client.name ?? formatPhone(client.phone_e164);
  const history = useClientAppointments(client.id);
  const visits = history.data ? clientStats(history.data).visits : null;
  const isVip = client.tags.includes(VIP_TAG);
  const openProfile = () => router.push(`/clients/${client.id}` as never);
  return (
    <View className="bg-card border-border rounded-2xl border p-4 shadow-sm">
      <View className="flex-row items-start justify-between">
        <Pressable
          onPress={openProfile}
          accessibilityRole="button"
          accessibilityLabel={t('booking.viewClient', { name })}
          className="flex-1 flex-row items-center gap-3.5 active:opacity-75"
        >
          <PersonAvatar name={name} size="lg" />
          <View className="flex-1">
            <Text className="text-foreground text-lg font-bold">{name}</Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Icon as={Phone} size={14} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">
                {formatPhone(client.phone_e164)}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={openProfile}
          accessibilityRole="button"
          accessibilityLabel={t('booking.viewClient', { name })}
          className="bg-muted active:bg-accent h-11 w-11 items-center justify-center rounded-full"
        >
          <Icon as={User} size={18} className="text-primary" />
        </Pressable>
      </View>
      {visits !== null ? (
        <View className="border-border mt-3 border-t pt-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            {t('booking.clientHistory')}
          </Text>
          <Text className="text-foreground mt-0.5 text-sm">
            {t(
              isVip
                ? 'booking.historyVip'
                : visits > 0
                  ? 'booking.historyReturning'
                  : 'booking.historyNew',
              {
                count: visits,
              },
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
