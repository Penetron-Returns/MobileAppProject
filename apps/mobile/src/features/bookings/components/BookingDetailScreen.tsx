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
import { CalendarX, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import {
  useAppointment,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { isFailed, loadError } from '@/lib/offline';
import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { formatMoney, formatPhone } from '@/lib/format';
import {
  businessDate,
  formatDateShort,
  formatTime,
  todayISO,
} from '@/lib/time';
import { toast, describeError } from '@/lib/toast';
import { canChange, dayRelation, statusCapsule } from '../logic';
import { PrimaryAction, MoreActions } from './BookingActions';
import { History } from './BookingHistory';

export function BookingDetailScreen({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { t } = useTranslation();
  const business = useBusiness();
  const appointment = useAppointment(appointmentId);
  const failed = isFailed(business)
    ? business
    : isFailed(appointment)
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
          {...describeError(loadError(failed))}
          onRetry={() => void failed.refetch()}
        />
      ) : !business.data || appointment.isPending ? (
        <LoadingCard />
      ) : !data ? (
        <EmptyState icon={CalendarX} title={t('booking.notFound')} />
      ) : (
        <>
          <SavedCopyBanner
            query={appointment}
            timezone={business.data.timezone}
          />
          <BookingBody appointment={data} business={business.data} />
        </>
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
