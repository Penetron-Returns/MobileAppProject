import { useRouter } from 'expo-router';
import { CalendarX } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Header, goBack } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingCard } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  useAppointment,
  useBookingRules,
  useRescheduleAppointment,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
import { isApiError } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import {
  businessDate,
  formatDateShort,
  formatTime,
  todayISO,
  type ISODate,
} from '@/lib/time';
import { toast } from '@/lib/toast';

import { bookingHorizonDays, canChange, toRescheduleRequest } from '../logic';
import { DoneCard } from './DoneCard';
import { SlotPicker, type PickedSlot } from './SlotPicker';
import { ToggleRow } from './ToggleRow';

/** Move a booking to another live slot; the current time is shown, never offered. */
export function RescheduleScreen({ appointmentId }: { appointmentId: string }) {
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
        <Header
          title={t('reschedule.title')}
          close
          fallbackHref={`/bookings/${appointmentId}`}
        />
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
      ) : !canChange(data.status) ? (
        <EmptyState
          icon={CalendarX}
          title={t('reschedule.notAllowed')}
          action={
            <Button variant="secondary" onPress={() => goBack('/calendar')}>
              <Text>{t('common.back')}</Text>
            </Button>
          }
        />
      ) : (
        <RescheduleForm appointment={data} business={business.data} />
      )}
    </Screen>
  );
}

function RescheduleForm({
  appointment,
  business,
}: {
  appointment: AppointmentDetail;
  business: BusinessSummary;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const tz = business.timezone;
  const rules = useBookingRules();
  const today = todayISO(tz);
  const [date, setDate] = React.useState<ISODate | null>(null);
  const [picked, setPicked] = React.useState<PickedSlot | null>(null);
  const [notify, setNotify] = React.useState(true);
  const [done, setDone] = React.useState<string | null>(null);
  const name = appointment.client.name ?? t('booking.thisClient');

  const move = useRescheduleAppointment({
    onSuccess: () =>
      setDone(
        `${formatDateShort(businessDate(picked?.startsAt ?? '', tz))}, ${formatTime(picked?.startsAt ?? '', tz)}`,
      ),
    onError: (error) => {
      if (isApiError(error) && error.code === 'SLOT_UNAVAILABLE') {
        toast.error(error, t('reschedule.slotTaken'));
        setPicked(null);
        return true;
      }
    },
  });

  const request = toRescheduleRequest({
    startsAt: picked?.startsAt ?? null,
    staffId: appointment.staff_id,
    notifyCustomer: notify,
  });

  if (done) {
    return (
      <View>
        <DoneCard
          title={t('reschedule.done')}
          lines={[
            notify ? t('reschedule.told', { name }) : t('reschedule.notTold'),
            t('reschedule.doneDetail', {
              when: done,
              service: appointment.service.name,
            }),
          ]}
        />
        <Button
          size="lg"
          className="mt-8"
          onPress={() => router.replace(`/bookings/${appointment.id}` as never)}
        >
          <Text className="text-title">{t('common.done')}</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-5">
      <View>
        <Text className="text-title text-muted-foreground">
          {t('reschedule.summary', {
            name,
            service: appointment.service.name,
            duration: formatDuration(appointment.duration_minutes),
          })}
        </Text>
        <Text className="mt-1 text-subtitle text-muted-foreground">
          {t('reschedule.current', {
            when: `${formatDateShort(businessDate(appointment.starts_at, tz))}, ${formatTime(appointment.starts_at, tz)}`,
          })}
        </Text>
      </View>
      <SlotPicker
        serviceId={appointment.service_id}
        staffId={appointment.staff_id}
        timezone={tz}
        today={today}
        horizonDays={bookingHorizonDays(rules.data)}
        date={date}
        onDateChange={setDate}
        selected={picked?.startsAt ?? null}
        onSelect={setPicked}
      />
      <ToggleRow
        label={t('reschedule.tell', { name })}
        checked={notify}
        onChange={setNotify}
      />
      <Button
        size="lg"
        disabled={!request || move.isPending}
        accessibilityState={{ busy: move.isPending }}
        onPress={() =>
          request && move.mutate({ id: appointment.id, ...request })
        }
      >
        <Text className="text-title">
          {picked
            ? t('reschedule.moveTo', {
                when: `${formatDateShort(businessDate(picked.startsAt, tz))}, ${formatTime(picked.startsAt, tz)}`,
              })
            : t('reschedule.pickTime')}
        </Text>
      </Button>
    </View>
  );
}
