import { useRouter } from 'expo-router';
import { CalendarX, Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Header, goBack } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingCard } from '@/components/States';
import { Surface } from '@/components/Surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  useAppointment,
  useBookingRules,
  useCancelAppointment,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
import { useDepth } from '@/hooks/useDepth';
import { businessDate, formatDateShort, formatTime } from '@/lib/time';

import {
  canChange,
  cancelReasonText,
  cancellationWindowMinutes,
  isLateCancellation,
  toCancelRequest,
  windowHours,
  type CancelReason,
} from '../logic';
import { DoneCard } from './DoneCard';
import { ToggleRow } from './ToggleRow';

const REASONS: CancelReason[] = ['client', 'staff', 'other'];

/** Why is this being cancelled, and does the client hear about it on WhatsApp. */
export function CancelScreen({ appointmentId }: { appointmentId: string }) {
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
          title={t('cancel.title')}
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
          title={t('cancel.notAllowed')}
          action={
            <Button variant="secondary" onPress={() => goBack('/calendar')}>
              <Text>{t('common.back')}</Text>
            </Button>
          }
        />
      ) : (
        <CancelForm appointment={data} business={business.data} />
      )}
    </Screen>
  );
}

function CancelForm({
  appointment,
  business,
}: {
  appointment: AppointmentDetail;
  business: BusinessSummary;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const rules = useBookingRules();
  const [reason, setReason] = React.useState<CancelReason>('client');
  const [other, setOther] = React.useState('');
  const [notify, setNotify] = React.useState(true);
  const [done, setDone] = React.useState(false);
  const tz = business.timezone;
  const name = appointment.client.name ?? t('booking.thisClient');
  const windowMin = cancellationWindowMinutes(rules.data);
  const isLate = isLateCancellation(
    appointment.starts_at,
    new Date(),
    windowMin,
  );
  const cancel = useCancelAppointment({ onSuccess: () => setDone(true) });

  if (done) {
    return (
      <View>
        <DoneCard
          title={t('cancel.done')}
          lines={[
            notify ? t('cancel.told', { name }) : t('cancel.notTold'),
            ...(isLate ? [t('cancel.recordedLate')] : []),
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

  const submit = () =>
    cancel.mutate({
      id: appointment.id,
      ...toCancelRequest(
        cancelReasonText(
          reason,
          {
            client: t('cancel.reasons.client'),
            staff: t('cancel.reasons.staff'),
          },
          other,
        ),
        notify,
      ),
    });

  return (
    <View className="gap-5">
      <View>
        <Text role="heading" aria-level="1" className="text-section font-bold">
          {t('cancel.question')}
        </Text>
        <Text className="mt-1 text-subtitle text-muted-foreground">
          {t('cancel.summary', {
            name,
            service: appointment.service.name,
            when: `${formatDateShort(businessDate(appointment.starts_at, tz))}, ${formatTime(appointment.starts_at, tz)}`,
          })}
        </Text>
      </View>

      <Surface
        variant="raised"
        accessibilityRole="radiogroup"
        accessibilityLabel={t('cancel.question')}
        className="overflow-hidden py-1"
      >
        {REASONS.map((r, index) => (
          <ReasonRow
            key={r}
            label={t(`cancel.reasons.${r}`)}
            selected={reason === r}
            showSeparator={index > 0}
            onPress={() => setReason(r)}
          />
        ))}
      </Surface>

      {reason === 'other' ? (
        <View className="gap-1.5">
          <Text className="text-subtitle font-semibold">
            {t('cancel.otherLabel')}
          </Text>
          <Input
            value={other}
            onChangeText={setOther}
            placeholder={t('cancel.otherPlaceholder')}
            accessibilityLabel={t('cancel.otherLabel')}
            maxLength={200}
          />
        </View>
      ) : null}

      {isLate ? (
        <Text className="text-subtitle text-muted-foreground">
          {t('cancel.late', { hours: windowHours(windowMin) })}
        </Text>
      ) : null}

      <ToggleRow
        label={t('cancel.tell', { name })}
        checked={notify}
        onChange={setNotify}
      />

      <Button
        variant="destructive"
        size="lg"
        disabled={cancel.isPending}
        accessibilityState={{ busy: cancel.isPending }}
        onPress={submit}
      >
        <Text className="text-title">{t('cancel.confirm')}</Text>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        onPress={() => goBack(`/bookings/${appointment.id}`)}
      >
        <Text className="text-title">{t('cancel.keep')}</Text>
      </Button>
    </View>
  );
}

function ReasonRow({
  label,
  selected,
  showSeparator,
  onPress,
}: {
  label: string;
  selected: boolean;
  showSeparator: boolean;
  onPress: () => void;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className="min-h-14 flex-row items-center justify-between px-4 active:bg-muted"
    >
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-4 right-0 top-0 h-0.5"
        />
      ) : null}
      <Text className="text-title">{label}</Text>
      {selected ? (
        <Check size={20} strokeWidth={2.6} color={depth.colors.tint} />
      ) : null}
    </Pressable>
  );
}
