import {
  Button,
  EmptyState,
  ErrorState,
  LoadingCard,
  Screen,
  StackHeader,
  Surface,
  Text,
  useDepth,
} from '@booking/ui';
import { router } from 'expo-router';
import {
  CalendarX,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import {
  useAppointment,
  useAppointmentEvents,
  useCheckInAppointment,
  useSetAppointmentStatus,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { formatMoney, formatPhone } from '@/lib/format';
import {
  businessDate,
  formatDateShort,
  formatTime,
  todayISO,
} from '@/lib/time';
import { toast, describeError } from '@/lib/toast';

import {
  canChange,
  dayRelation,
  HISTORY_EVENTS,
  primaryAction,
  statusCapsule,
} from '../logic';

export function BookingDetailScreen({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { t } = useTranslation();
  const business = useBusiness();
  const appointment = useAppointment(appointmentId);
  const failed = business.isError
    ? business
    : appointment.isError
      ? appointment
      : null;
  const data = appointment.data;
  return (
    <Screen
      header={
        <StackHeader title={t('booking.title')} fallbackHref="/calendar" />
      }
      onRefresh={() => Promise.all([business.refetch(), appointment.refetch()])}
    >
      {failed ? (
        <ErrorState
          variant="banner"
          {...describeError(failed.error)}
          onRetry={() => void failed.refetch()}
        />
      ) : !business.data || appointment.isPending ? (
        <LoadingCard />
      ) : !data ? (
        <EmptyState icon={CalendarX} title={t('booking.notFound')} />
      ) : (
        <BookingBody appointment={data} business={business.data} />
      )}
    </Screen>
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
  const depth = useDepth();
  const tz = business.timezone;
  const date = businessDate(appointment.starts_at, tz);
  const relation = dayRelation(date, todayISO(tz));
  const capsule = statusCapsule(appointment.status);
  const client = appointment.client;
  const name = client.name ?? formatPhone(client.phone_e164);
  const when = `${relation === 'other' ? formatDateShort(date) : t(`booking.${relation}`)} · ${t('booking.timeRange', { start: formatTime(appointment.starts_at, tz), end: formatTime(appointment.ends_at, tz) })}`;
  const changeable = canChange(appointment.status);

  const openWhatsApp = () =>
    Linking.openURL(whatsAppChatUrl(client.phone_e164, '')).catch(() =>
      toast.info(t('booking.whatsAppFailed')),
    );

  return (
    <View className="gap-4">
      <View>
        <Text
          role="heading"
          aria-level="1"
          className="text-large-title font-bold"
        >
          {appointment.service.name}
        </Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-title text-muted-foreground"
        >
          {when}
        </Text>
        {capsule ? (
          <View
            style={{
              backgroundColor:
                capsule === 'no_show'
                  ? depth.colors.amberFill
                  : depth.colors.badgeRing,
            }}
            className="mt-2.5 self-start rounded-xl px-2.5 py-[3px]"
          >
            <Text
              style={{
                color:
                  capsule === 'no_show'
                    ? depth.colors.amber
                    : depth.colors.secondary,
              }}
              className="text-meta font-semibold"
            >
              {t(`status.${capsule}`)}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => router.push(`/clients/${client.id}` as never)}
        accessibilityRole="button"
        accessibilityLabel={t('booking.viewClient', { name })}
      >
        <Surface
          variant="raised"
          className="min-h-[72px] flex-row items-center gap-3 px-4"
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-title font-semibold">
              {name}
            </Text>
            <Text className="text-subtitle text-muted-foreground">
              {formatPhone(client.phone_e164)}
            </Text>
          </View>
          <ChevronRight
            size={16}
            strokeWidth={2.6}
            color={depth.colors.secondary}
          />
        </Surface>
      </Pressable>

      <PrimaryAction appointment={appointment} name={name} />

      <View className="flex-row gap-2.5">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onPress={openWhatsApp}
          accessibilityLabel={t('booking.messageLabel', { name })}
        >
          <Text className="text-title" style={{ color: depth.colors.tint }}>
            {t('booking.message')}
          </Text>
        </Button>
        {changeable ? (
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onPress={() =>
              router.push(`/bookings/reschedule/${appointment.id}` as never)
            }
            accessibilityLabel={t('booking.rescheduleLabel', { name })}
          >
            <Text className="text-title" style={{ color: depth.colors.tint }}>
              {t('booking.reschedule')}
            </Text>
          </Button>
        ) : null}
      </View>

      {appointment.notes ? (
        <View>
          <Text className="text-subtitle font-semibold text-muted-foreground">
            {t('booking.notes')}
          </Text>
          <Text className="mt-1 text-title">{appointment.notes}</Text>
        </View>
      ) : null}

      <Surface variant="raised" className="px-4 py-1">
        <DetailRow label={t('booking.staff')} value={appointment.staff.name} />
        <DetailRow
          label={t('booking.price')}
          value={formatMoney(appointment.price_cents, business.currency)}
          showSeparator
        />
      </Surface>

      <History appointmentId={appointment.id} timezone={tz} />

      {changeable ? <MoreActions appointment={appointment} /> : null}
    </View>
  );
}

function PrimaryAction({
  appointment,
  name,
}: {
  appointment: AppointmentDetail;
  name: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const checkIn = useCheckInAppointment({
    onSuccess: () => toast.success(t('today.checkedInToast', { name })),
  });
  const checkOut = useSetAppointmentStatus({
    onSuccess: () => toast.success(t('booking.checkedOutToast', { name })),
  });
  const action = primaryAction(appointment);
  if (action === 'none') return null;
  if (action === 'checkIn') {
    return (
      <Button
        size="lg"
        disabled={checkIn.isPending}
        accessibilityLabel={t('today.checkInLabel', { name })}
        accessibilityState={{ busy: checkIn.isPending }}
        onPress={() => checkIn.mutate(appointment.id)}
      >
        <Text className="text-title">{t('today.checkIn')}</Text>
      </Button>
    );
  }
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center gap-1.5">
        <Check size={20} strokeWidth={2.6} color={depth.colors.green} />
        <Text
          style={{ color: depth.colors.green }}
          className="text-title font-semibold"
        >
          {t('today.checkedIn')}
        </Text>
      </View>
      <Button
        size="lg"
        disabled={checkOut.isPending}
        accessibilityLabel={t('booking.checkOutLabel', { name })}
        accessibilityState={{ busy: checkOut.isPending }}
        onPress={() =>
          checkOut.mutate({ id: appointment.id, status: 'completed' })
        }
      >
        <Text className="text-title">{t('booking.checkOut')}</Text>
      </Button>
    </View>
  );
}

function DetailRow({
  label,
  value,
  showSeparator,
}: {
  label: string;
  value: string;
  showSeparator?: boolean;
}) {
  return (
    <View className="min-h-12 flex-row items-center justify-between">
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-0 right-0 top-0 h-0.5"
        />
      ) : null}
      <Text className="text-title text-muted-foreground">{label}</Text>
      <Text className="text-title">{value}</Text>
    </View>
  );
}

function History({
  appointmentId,
  timezone,
}: {
  appointmentId: string;
  timezone: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [open, setOpen] = React.useState(false);
  const events = useAppointmentEvents(appointmentId);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('booking.history')}
        className="min-h-12 flex-row items-center gap-1.5"
      >
        <Text style={{ color: depth.colors.tint }} className="text-title">
          {t('booking.history')}
        </Text>
        <ChevronDown
          size={16}
          strokeWidth={2.6}
          color={depth.colors.tint}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? (
        <Surface variant="raised" className="px-4 py-1">
          {events.isError ? (
            <Text className="py-3 text-subtitle text-muted-foreground">
              {t('booking.historyFailed')}
            </Text>
          ) : null}
          {(events.data ?? [])
            .filter((e) =>
              (HISTORY_EVENTS as readonly string[]).includes(e.type),
            )
            .map((e, index) => (
              <View
                key={e.id}
                className="min-h-12 flex-row items-center justify-between gap-3"
              >
                {index > 0 ? (
                  <Surface
                    variant="engrave"
                    className="absolute left-0 right-0 top-0 h-0.5"
                  />
                ) : null}
                <Text className="flex-1 text-title">
                  {t(`booking.event.${e.type}`)}
                </Text>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-meta text-muted-foreground"
                >
                  {`${formatDateShort(businessDate(e.occurred_at, timezone))} ${formatTime(e.occurred_at, timezone)}`}
                </Text>
              </View>
            ))}
        </Surface>
      ) : null}
    </View>
  );
}

function MoreActions({ appointment }: { appointment: AppointmentDetail }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [open, setOpen] = React.useState(false);
  const noShow = useSetAppointmentStatus({
    onSuccess: () => toast.success(t('booking.markedNoShow')),
  });
  return (
    <View>
      <Pressable
        onPress={() =>
          router.push(`/bookings/cancel/${appointment.id}` as never)
        }
        accessibilityRole="button"
        accessibilityLabel={t('booking.cancel')}
        className="min-h-12 items-center justify-center active:opacity-50"
      >
        <Text style={{ color: '#FF3B30' }} className="text-title">
          {t('booking.cancel')}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('booking.more')}
        className="min-h-12 flex-row items-center justify-center gap-1.5"
      >
        <Text style={{ color: depth.colors.tint }} className="text-title">
          {t('booking.more')}
        </Text>
        <ChevronDown size={16} strokeWidth={2.6} color={depth.colors.tint} />
      </Pressable>
      {open ? (
        <Button
          variant="secondary"
          size="lg"
          disabled={noShow.isPending}
          onPress={() =>
            noShow.mutate({ id: appointment.id, status: 'no_show' })
          }
        >
          <Text className="text-title">{t('booking.markNoShow')}</Text>
        </Button>
      ) : null}
    </View>
  );
}
