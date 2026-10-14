import {
  BlockedActionSheet,
  Button,
  EmptyState,
  ErrorState,
  goBack,
  Input,
  LoadingCard,
  Screen,
  StackHeader,
  Surface,
  SwitchRow,
  Text,
  useOfflineGuard,
} from '@booking/ui';
import { CalendarX } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { isFailed, loadError } from '@/lib/offline';
import { useIsOnline } from '@/lib/online';
import { describeError } from '@/lib/toast';
import {
  useAppointment,
  useBookingRules,
  useCancelAppointment,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
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
import { CancelOutcome, CancelDone, ReasonRow } from './CancelParts';

const REASONS: CancelReason[] = ['client', 'staff', 'other'];

interface CancelChoice {
  request: ReturnType<typeof toCancelRequest>;
  outcome: CancelOutcome;
}

/** Why is this being cancelled, and does the client hear about it on WhatsApp. */
export function CancelScreen({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation();
  const business = useBusiness();
  const appointment = useAppointment(appointmentId);
  const failed = isFailed(business)
    ? business
    : isFailed(appointment)
      ? appointment
      : null;
  const data = appointment.data;
  // The mutation and its result live here, not in the form: a successful
  // cancel refetches the booking as cancelled, which swaps the form for the
  // "can't be changed" state and would take the done card down with it.
  const [outcome, setOutcome] = React.useState<CancelOutcome | null>(null);
  const submitted = React.useRef<CancelOutcome | null>(null);
  const cancel = useCancelAppointment({
    onSuccess: () => setOutcome(submitted.current),
  });
  const confirm = ({ request, outcome: result }: CancelChoice) => {
    submitted.current = result;
    cancel.mutate({ id: appointmentId, ...request });
  };
  return (
    <Screen
      header={
        <StackHeader
          title={t('cancel.title')}
          close
          fallbackHref={`/bookings/${appointmentId}`}
        />
      }
    >
      {outcome ? (
        <CancelDone appointmentId={appointmentId} outcome={outcome} />
      ) : failed ? (
        <ErrorState
          variant="banner"
          {...describeError(loadError(failed))}
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
        <CancelForm
          appointment={data}
          business={business.data}
          isPending={cancel.isPending}
          onConfirm={confirm}
        />
      )}
    </Screen>
  );
}

function CancelForm({
  appointment,
  business,
  isPending,
  onConfirm,
}: {
  appointment: AppointmentDetail;
  business: BusinessSummary;
  isPending: boolean;
  onConfirm: (choice: CancelChoice) => void;
}) {
  const { t } = useTranslation();
  const rules = useBookingRules();
  const isOnline = useIsOnline();
  const { guard, sheetProps } = useOfflineGuard(!isOnline);
  const [reason, setReason] = React.useState<CancelReason>('client');
  const [other, setOther] = React.useState('');
  const [notify, setNotify] = React.useState(true);
  const tz = business.timezone;
  const name = appointment.client.name ?? t('booking.thisClient');
  const windowMin = cancellationWindowMinutes(rules.data);
  const isLate = isLateCancellation(
    appointment.starts_at,
    new Date(),
    windowMin,
  );

  const submit = () =>
    onConfirm({
      request: toCancelRequest(
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
      outcome: { name, notify, isLate },
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

      <SwitchRow
        variant="card"
        title={t('cancel.tell', { name })}
        checked={notify}
        onCheckedChange={setNotify}
      />

      <Button
        variant="destructive"
        size="lg"
        disabled={isPending}
        accessibilityLabel={t('cancel.confirm')}
        accessibilityState={{ busy: isPending }}
        onPress={guard(submit)}
      >
        <Text className="text-title">{t('cancel.confirm')}</Text>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        accessibilityLabel={t('cancel.keep')}
        onPress={() => goBack(`/bookings/${appointment.id}`)}
      >
        <Text className="text-title">{t('cancel.keep')}</Text>
      </Button>
      <BlockedActionSheet {...sheetProps} />
    </View>
  );
}
