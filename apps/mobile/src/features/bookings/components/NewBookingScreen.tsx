import {
  BlockedActionSheet,
  Button,
  ConfirmDialog,
  DoneCard,
  goBack,
  haptics,
  IconButton,
  Screen,
  StackHeader,
  Text,
  useOfflineGuard,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, View } from 'react-native';

import {
  useBookingRules,
  useCreateAppointment,
  usePrefetchAvailability,
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
import { apiFieldErrors } from '@/lib/form-errors';
import { useIsOnline } from '@/lib/online';
import { qk } from '@/lib/query';
import {
  businessDate,
  formatDateShort,
  formatTime,
  todayISO,
} from '@/lib/time';
import { toast } from '@/lib/toast';

import {
  bookableStaff,
  bookingHorizonDays,
  dayRange,
  hasUnsavedInput,
  toCreateRequest,
} from '../logic';
import { whenFromPrefill, type BookingPrefill } from '../prefill';
import { ClientStep, type ClientChoice } from './ClientStep';
import { WhenStep, type WhenState } from './WhenStep';

/** API field names that mean the new client's phone (zod reports `new_client.phone` as `new_client`). */
const PHONE_FIELDS = new Set(['phone', 'new_client']);

const EMPTY_CLIENT: ClientChoice = {
  mode: 'existing',
  client: null,
  newName: '',
  newPhone: '',
};

/** Closes the sheet, falling back to Today when opened from a deep link. */
const closeSheet = () => goBack('/');

/**
 * New booking: who and what, then when (live), then confirm. Presented as a
 * full-screen modal, so it mounts fresh each time and closing discards it.
 */
export function NewBookingScreen({
  initialClientId,
  startWithNewClient,
  prefill,
}: {
  initialClientId?: string;
  startWithNewClient?: boolean;
  /** Staff, day and time from a long-press on the calendar. */
  prefill?: BookingPrefill;
}) {
  return (
    <BusinessGate>
      {(business) => (
        <NewBookingFlow
          business={business}
          initialClientId={initialClientId}
          startWithNewClient={startWithNewClient}
          prefill={prefill}
        />
      )}
    </BusinessGate>
  );
}

function NewBookingFlow({
  business,
  initialClientId,
  startWithNewClient,
  prefill,
}: {
  business: BusinessSummary;
  initialClientId?: string;
  startWithNewClient?: boolean;
  prefill?: BookingPrefill;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tz = business.timezone;
  const isOnline = useIsOnline();
  const { guard, sheetProps } = useOfflineGuard(!isOnline);
  const [step, setStep] = React.useState<1 | 2>(1);
  const [phoneError, setPhoneError] = React.useState(false);
  const [choice, setChoice] = React.useState<ClientChoice>({
    ...EMPTY_CLIENT,
    mode: startWithNewClient ? 'new' : 'existing',
  });
  const [serviceId, setServiceId] = React.useState<string | null>(null);
  const startWhen = React.useMemo(() => whenFromPrefill(prefill), [prefill]);
  const [when, setWhen] = React.useState<WhenState>(startWhen);
  const [takenAt, setTakenAt] = React.useState<string | null>(null);
  // Shown the moment the owner confirms; `id` follows when the server answers.
  const [booked, setBooked] = React.useState<{
    id: string | null;
    label: string;
  } | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const labelFor = (startsAt: string) =>
    startsAt
      ? `${formatDateShort(businessDate(startsAt, tz))}, ${formatTime(startsAt, tz)}`
      : '';
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);

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
  const activeServices = React.useMemo(
    () => (services.data ?? []).filter((s) => s.is_active),
    [services.data],
  );
  const service = activeServices.find((s) => s.id === serviceId) ?? null;
  // Memoised: the effect below must not re-run on every render.
  const staffOptions = React.useMemo(
    () => bookableStaff(staff.data ?? [], links.data ?? [], serviceId),
    [staff.data, links.data, serviceId],
  );
  const prefetchAvailability = usePrefetchAvailability();
  const horizonDays = bookingHorizonDays(rules.data);
  const onService = React.useCallback(
    (id: string | null) => {
      setServiceId(id);
      setWhen(startWhen);
      if (!id) return;
      // Warm the next step while the owner finishes this one.
      const range = dayRange(todayISO(tz), horizonDays);
      void prefetchAvailability({
        serviceId: id,
        from: range.from,
        to: range.to,
        staffId: startWhen.staffId,
      });
    },
    [startWhen, tz, horizonDays, prefetchAvailability],
  );
  // A staff member who cannot do the chosen service falls back to "Any".
  React.useEffect(() => {
    if (!staff.data || !links.data) return;
    if (when.staffId && !staffOptions.some((s) => s.id === when.staffId)) {
      setWhen((w) => ({ ...w, staffId: null, picked: null }));
    }
  }, [when.staffId, staffOptions, staff.data, links.data]);

  const create = useCreateAppointment({
    onSuccess: (id) =>
      setBooked((b) => ({
        id,
        label: b?.label ?? labelFor(when.picked?.startsAt ?? ''),
      })),
    onError: (error) => {
      // The optimistic "booked" screen was wrong: back to the form.
      setBooked(null);
      // Closed meanwhile: nobody is left to show the conflict card, so let the toast say it.
      if (!mounted.current) return false;
      if (isApiError(error) && error.code === 'SLOT_UNAVAILABLE') {
        // Conflicts are normal: refresh the live slots and offer the closest ones.
        haptics.warning();
        setTakenAt(when.picked?.startsAt ?? null);
        setWhen((w) => ({ ...w, picked: null }));
        void queryClient.invalidateQueries({ queryKey: qk.availabilitySlots });
        void queryClient.invalidateQueries({ queryKey: qk.availabilityDays });
        return true;
      }
      // A bad phone belongs under its field, on the step that has the field.
      if (apiFieldErrors(error).some((e) => PHONE_FIELDS.has(e.field))) {
        haptics.warning();
        setPhoneError(true);
        setStep(1);
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
  const isDirty = hasUnsavedInput(
    {
      client: {
        mode: choice.mode,
        hasClient: Boolean(choice.client),
        name: choice.newName,
        phone: choice.newPhone,
      },
      serviceId,
      notes: when.notes,
    },
    Boolean(initialClientId) && choice.client?.id === initialClientId,
  );
  // ✕ and the Android back button share one path: ask only when input would be lost.
  const requestClose = () => {
    if (booked || !isDirty) closeSheet();
    else setConfirmingDiscard(true);
  };
  const requestCloseRef = React.useRef(requestClose);
  requestCloseRef.current = requestClose;
  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        requestCloseRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );
  const closeButton = (
    <IconButton
      icon={X}
      label={t('common.close')}
      onPress={requestClose}
      variant="plain"
    />
  );
  const firstName =
    (choice.mode === 'new' ? choice.newName : (choice.client?.name ?? ''))
      .trim()
      .split(' ')[0] || t('newBooking.thisClient');

  if (booked) {
    return (
      <Screen
        header={
          <StackHeader
            title={t('newBooking.title')}
            hideBack
            right={closeButton}
          />
        }
      >
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
            accessibilityLabel={t('common.done')}
            onPress={closeSheet}
          >
            <Text className="text-title">{t('common.done')}</Text>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={!booked.id}
            accessibilityState={{ busy: !booked.id, disabled: !booked.id }}
            onPress={() => {
              closeSheet();
              router.push(`/bookings/${booked.id}` as never);
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
      toast.blocked(t(`newBooking.errors.${result.error}`));
      return;
    }
    setBooked({ id: null, label: labelFor(when.picked?.startsAt ?? '') });
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
          right={closeButton}
        />
      }
      footer={
        <Button
          size="lg"
          // Booking plays its own success haptic; only "Next" taps lightly.
          haptic={step === 1}
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
          onChoice={(next) => {
            setPhoneError(false);
            setChoice(next);
          }}
          phoneError={phoneError}
          services={activeServices}
          serviceId={serviceId}
          onService={onService}
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
          horizonDays={horizonDays}
          firstName={firstName}
          preferredTime={prefill?.time ?? null}
          takenAt={takenAt}
          onTakenDismiss={() => setTakenAt(null)}
        />
      ) : null}
      <BlockedActionSheet {...sheetProps} />
      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title={t('newBooking.discard.title')}
        description={t('newBooking.discard.description')}
        confirmLabel={t('newBooking.discard.confirm')}
        cancelLabel={t('newBooking.discard.keep')}
        destructive
        onConfirm={closeSheet}
      />
    </Screen>
  );
}
