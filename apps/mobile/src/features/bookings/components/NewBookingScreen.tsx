import {
  BlockedActionSheet,
  Button,
  DoneCard,
  Screen,
  StackHeader,
  Text,
  useOfflineGuard,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useBookingRules,
  useCreateAppointment,
} from '@/features/appointments/hooks';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import type { BusinessSummary } from '@/features/business/hooks';
import {
  useServices,
  useStaff,
  useStaffServices,
} from '@/features/catalog/hooks';
import { useClient } from '@/features/clients/hooks';
import { isApiError } from '@/lib/api';
import { useIsOnline } from '@/lib/online';
import { qk } from '@/lib/query';
import {
  businessDate,
  formatDateShort,
  formatTime,
  todayISO,
} from '@/lib/time';
import { toast } from '@/lib/toast';

import { bookableStaff, bookingHorizonDays, toCreateRequest } from '../logic';
import { ClientStep, type ClientChoice } from './ClientStep';
import { WhenStep, type WhenState } from './WhenStep';

const EMPTY_CLIENT: ClientChoice = {
  mode: 'existing',
  client: null,
  newName: '',
  newPhone: '',
};
const EMPTY_WHEN: WhenState = {
  staffId: null,
  date: null,
  picked: null,
  notes: '',
  sendWhatsApp: true,
};

/** New booking: who and what, then when (live), then confirm. */
export function NewBookingScreen({
  initialClientId,
  startWithNewClient,
}: {
  initialClientId?: string;
  startWithNewClient?: boolean;
}) {
  // The Add tab stays mounted, so a new key after each booking gives an empty form.
  const [formKey, setFormKey] = React.useState(0);
  return (
    <BusinessGate>
      {(business) => (
        <NewBookingFlow
          key={formKey}
          business={business}
          initialClientId={initialClientId}
          startWithNewClient={startWithNewClient}
          onReset={() => setFormKey((k) => k + 1)}
        />
      )}
    </BusinessGate>
  );
}

function NewBookingFlow({
  business,
  initialClientId,
  startWithNewClient,
  onReset,
}: {
  business: BusinessSummary;
  initialClientId?: string;
  startWithNewClient?: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tz = business.timezone;
  const isOnline = useIsOnline();
  const { guard, sheetProps } = useOfflineGuard(!isOnline);
  const [step, setStep] = React.useState<1 | 2>(1);
  const [choice, setChoice] = React.useState<ClientChoice>({
    ...EMPTY_CLIENT,
    mode: startWithNewClient ? 'new' : 'existing',
  });
  const [serviceId, setServiceId] = React.useState<string | null>(null);
  const [when, setWhen] = React.useState<WhenState>(EMPTY_WHEN);
  const [takenAt, setTakenAt] = React.useState<string | null>(null);
  const [booked, setBooked] = React.useState<{
    id: string;
    label: string;
  } | null>(null);

  // Route params preselect the client once. Background refetches hand back a
  // new object for the same client, and must not undo what the user picked since.
  const preselected = useClient(initialClientId ?? '');
  const appliedClientId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!initialClientId || !preselected.data) return;
    if (appliedClientId.current === initialClientId) return;
    appliedClientId.current = initialClientId;
    setChoice({ ...EMPTY_CLIENT, client: preselected.data });
  }, [initialClientId, preselected.data]);

  const services = useServices();
  const staff = useStaff();
  const links = useStaffServices();
  const rules = useBookingRules();
  const activeServices = (services.data ?? []).filter((s) => s.is_active);
  const service = activeServices.find((s) => s.id === serviceId) ?? null;
  const staffOptions = bookableStaff(
    staff.data ?? [],
    links.data ?? [],
    serviceId,
  );

  const create = useCreateAppointment({
    onSuccess: (id) => {
      const startsAt = when.picked?.startsAt ?? '';
      setBooked({
        id,
        label: startsAt
          ? `${formatDateShort(businessDate(startsAt, tz))}, ${formatTime(startsAt, tz)}`
          : '',
      });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'SLOT_UNAVAILABLE') {
        // Conflicts are normal: refresh the live slots and offer the closest ones.
        setTakenAt(when.picked?.startsAt ?? null);
        setWhen((w) => ({ ...w, picked: null }));
        void queryClient.invalidateQueries({ queryKey: qk.availabilitySlots });
        void queryClient.invalidateQueries({ queryKey: qk.availabilityDays });
        return true;
      }
    },
  });

  const form = {
    clientMode: choice.mode,
    clientId: choice.client?.id ?? null,
    newClientName: choice.newName,
    newClientPhone: choice.newPhone,
    serviceId,
    staffId: when.staffId,
    startsAt: when.picked?.startsAt ?? null,
    notes: when.notes,
    sendWhatsApp: when.sendWhatsApp,
  };
  const firstName =
    (choice.mode === 'new' ? choice.newName : (choice.client?.name ?? ''))
      .trim()
      .split(' ')[0] || t('newBooking.thisClient');

  if (booked) {
    return (
      <Screen header={<StackHeader title={t('newBooking.title')} hideBack />}>
        <DoneCard
          title={t('newBooking.done')}
          lines={[
            when.sendWhatsApp
              ? t('newBooking.told', { name: firstName })
              : t('newBooking.notTold'),
            t('newBooking.doneDetail', {
              when: booked.label,
              service: service?.name ?? '',
            }),
          ]}
        />
        <View className="mt-6 gap-2.5">
          <Button
            size="lg"
            onPress={() => {
              router.setParams({ clientId: '', mode: '' });
              onReset();
              router.navigate('/' as never);
            }}
          >
            <Text className="text-title">{t('common.done')}</Text>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onPress={() => {
              const id = booked.id;
              router.setParams({ clientId: '', mode: '' });
              onReset();
              router.push(`/bookings/${id}` as never);
            }}
          >
            <Text className="text-title">{t('newBooking.view')}</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  const clientReady =
    choice.mode === 'new'
      ? Boolean(choice.newName.trim() && choice.newPhone.trim())
      : Boolean(choice.client);
  const next = () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    const result = toCreateRequest(form);
    if (!result.ok) {
      toast.info(t(`newBooking.errors.${result.error}`));
      return;
    }
    create.mutate(result.request);
  };

  const primaryLabel =
    step === 1
      ? t('newBooking.next')
      : when.picked
        ? t('newBooking.bookFor', {
            name: firstName,
            when: `${formatDateShort(businessDate(when.picked.startsAt, tz))} ${formatTime(when.picked.startsAt, tz)}`,
          })
        : t('newBooking.pickTime');
  const disabled =
    create.isPending ||
    (step === 1 ? !clientReady || !serviceId : !when.picked);

  return (
    <Screen
      header={
        <StackHeader
          title={t('newBooking.title')}
          hideBack={step === 1}
          onBack={() => setStep(1)}
        />
      }
      footer={
        <Button
          size="lg"
          disabled={disabled}
          accessibilityLabel={primaryLabel}
          accessibilityState={{ busy: create.isPending, disabled }}
          onPress={step === 1 ? next : guard(next)}
        >
          <Text className="text-title">{primaryLabel}</Text>
        </Button>
      }
    >
      {step === 1 ? (
        <ClientStep
          choice={choice}
          onChoice={setChoice}
          services={activeServices}
          serviceId={serviceId}
          onService={(id) => {
            setServiceId(id);
            setWhen(EMPTY_WHEN);
          }}
          currency={business.currency}
        />
      ) : serviceId ? (
        <WhenStep
          state={when}
          onChange={(patch) => setWhen((w) => ({ ...w, ...patch }))}
          serviceId={serviceId}
          staff={staffOptions}
          timezone={tz}
          today={todayISO(tz)}
          horizonDays={bookingHorizonDays(rules.data)}
          firstName={firstName}
          takenAt={takenAt}
          onTakenDismiss={() => setTakenAt(null)}
        />
      ) : null}
      <BlockedActionSheet {...sheetProps} />
    </Screen>
  );
}
