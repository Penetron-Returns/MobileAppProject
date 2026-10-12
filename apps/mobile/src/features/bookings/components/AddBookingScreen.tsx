import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  CheckCircle,
  ChevronDown,
  MessageCircle,
  Sparkles,
  User,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { OptionSheet } from '@/components/OptionSheet';
import { Screen } from '@/components/Screen';
import { TabHeader } from '@/components/TabHeader';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAppointment } from '@/features/appointments/hooks';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import type { BusinessSummary } from '@/features/business/hooks';
import {
  useServices,
  useStaff,
  useStaffServices,
} from '@/features/catalog/hooks';
import { useClient, type ClientOption } from '@/features/clients/hooks';
import { isApiError } from '@/lib/api';
import { qk } from '@/lib/query';
import { formatDuration, formatMoney } from '@/lib/format';
import { todayISO, type ISODate } from '@/lib/time';
import { toast } from '@/lib/toast';

import { bookableStaff, toCreateRequest, upcomingDates } from '../logic';
import { ClientSection, SectionLabel } from './ClientSection';
import { SlotSection } from './SlotSection';

const ANY_STAFF = 'any';

export function AddBookingScreen({
  initialClientId,
  startWithNewClient,
}: {
  initialClientId?: string;
  startWithNewClient?: boolean;
}) {
  return (
    <BusinessGate>
      {(business) => (
        <AddBookingForm
          business={business}
          initialClientId={initialClientId}
          startWithNewClient={startWithNewClient}
        />
      )}
    </BusinessGate>
  );
}

function AddBookingForm({
  business,
  initialClientId,
  startWithNewClient,
}: {
  business: BusinessSummary;
  initialClientId?: string;
  startWithNewClient?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = todayISO(business.timezone);
  const [clientMode, setClientMode] = React.useState<'existing' | 'new'>(
    startWithNewClient ? 'new' : 'existing',
  );
  const [client, setClient] = React.useState<ClientOption | null>(null);
  const [newName, setNewName] = React.useState('');
  const [newPhone, setNewPhone] = React.useState('');
  const [serviceId, setServiceId] = React.useState<string | null>(null);
  const [staffChoice, setStaffChoice] = React.useState<string>(ANY_STAFF);
  const [date, setDate] = React.useState<ISODate>(today);
  const [startsAt, setStartsAt] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const [sendWhatsApp, setSendWhatsApp] = React.useState(true);
  const [sheet, setSheet] = React.useState<'service' | 'staff' | null>(null);

  const preselected = useClient(initialClientId ?? '');
  React.useEffect(() => {
    if (initialClientId && preselected.data) {
      setClientMode('existing');
      setClient(preselected.data);
    }
  }, [initialClientId, preselected.data]);

  const services = useServices();
  const staff = useStaff();
  const links = useStaffServices();
  const activeServices = (services.data ?? []).filter((s) => s.is_active);
  const service = activeServices.find((s) => s.id === serviceId) ?? null;
  const staffOptions = bookableStaff(
    staff.data ?? [],
    links.data ?? [],
    serviceId,
  );
  const staffId = staffChoice === ANY_STAFF ? null : staffChoice;

  const resetSlot = () => setStartsAt(null);
  const create = useCreateAppointment({
    onSuccess: (id) => {
      toast.success(t('addBooking.created'));
      router.replace(`/bookings/${id}` as never);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'SLOT_UNAVAILABLE') {
        toast.error(error, t('addBooking.slotTaken'));
        resetSlot();
        void queryClient.invalidateQueries({ queryKey: qk.availabilitySlots });
        return true;
      }
    },
  });

  const save = () => {
    const result = toCreateRequest({
      clientMode,
      clientId: client?.id ?? null,
      newClientName: newName,
      newClientPhone: newPhone,
      serviceId,
      staffId,
      startsAt,
      notes,
      sendWhatsApp,
    });
    if (!result.ok) {
      toast.info(t(`addBooking.errors.${result.error}`));
      return;
    }
    create.mutate(result.request);
  };

  return (
    <Screen
      header={<TabHeader />}
      footer={
        <Pressable
          onPress={save}
          disabled={create.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('addBooking.save')}
          accessibilityState={{ busy: create.isPending }}
          className="bg-primary flex-row items-center justify-center gap-2 rounded-xl py-3.5 shadow-md active:opacity-90"
        >
          <Icon
            as={CheckCircle}
            size={20}
            className="text-primary-foreground"
          />
          <Text className="text-primary-foreground text-base font-semibold">
            {create.isPending ? t('addBooking.saving') : t('addBooking.save')}
          </Text>
        </Pressable>
      }
    >
      <View className="mx-auto w-full max-w-lg gap-6 pb-8">
        <ClientSection
          mode={clientMode}
          onModeChange={setClientMode}
          selected={client}
          onSelect={setClient}
          newName={newName}
          onNewNameChange={setNewName}
          newPhone={newPhone}
          onNewPhoneChange={setNewPhone}
        />

        <View className="gap-2">
          <SectionLabel>{t('addBooking.service')}</SectionLabel>
          <PickerButton
            icon={Sparkles}
            label={service ? service.name : t('addBooking.pickService')}
            detail={
              service
                ? `${formatDuration(service.duration_minutes)} · ${formatMoney(service.price_cents, business.currency)}`
                : undefined
            }
            onPress={() => setSheet('service')}
          />
        </View>

        <View className="gap-2">
          <SectionLabel>{t('addBooking.staff')}</SectionLabel>
          <PickerButton
            icon={User}
            label={
              staffOptions.find((s) => s.id === staffId)?.name ??
              t('addBooking.anyStaff')
            }
            onPress={() => setSheet('staff')}
          />
        </View>

        <SlotSection
          dates={upcomingDates(today)}
          today={today}
          date={date}
          onDateChange={(d) => {
            setDate(d);
            resetSlot();
          }}
          serviceId={serviceId}
          staffId={staffId}
          timezone={business.timezone}
          startsAt={startsAt}
          onSlotChange={setStartsAt}
        />

        <View className="gap-2">
          <SectionLabel>{t('addBooking.notes')}</SectionLabel>
          <Textarea
            value={notes}
            onChangeText={setNotes}
            placeholder={t('addBooking.notesPlaceholder')}
          />
        </View>

        <View className="border-border bg-accent/30 flex-row items-center justify-between rounded-xl border p-4">
          <View className="flex-1 flex-row items-center gap-3 pr-3">
            <View className="bg-whatsapp/10 h-10 w-10 items-center justify-center rounded-full">
              <Icon as={MessageCircle} size={22} className="text-whatsapp" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">
                {t('addBooking.whatsApp')}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {t('addBooking.whatsAppHint')}
              </Text>
            </View>
          </View>
          <Switch
            checked={sendWhatsApp}
            onCheckedChange={setSendWhatsApp}
            accessibilityLabel={t('addBooking.whatsApp')}
          />
        </View>
      </View>

      <OptionSheet
        open={sheet === 'service'}
        onOpenChange={(open) => setSheet(open ? 'service' : null)}
        title={t('addBooking.pickService')}
        selected={serviceId}
        options={activeServices.map((s) => ({
          value: s.id,
          label: s.name,
          description: `${formatDuration(s.duration_minutes)} · ${formatMoney(s.price_cents, business.currency)}`,
        }))}
        onSelect={(id) => {
          setServiceId(id);
          setStaffChoice(ANY_STAFF);
          resetSlot();
        }}
      />
      <OptionSheet
        open={sheet === 'staff'}
        onOpenChange={(open) => setSheet(open ? 'staff' : null)}
        title={t('addBooking.pickStaff')}
        selected={staffChoice}
        options={[
          { value: ANY_STAFF, label: t('addBooking.anyStaff') },
          ...staffOptions.map((s) => ({
            value: s.id,
            label: s.name,
            description: s.title ?? undefined,
          })),
        ]}
        onSelect={(id) => {
          setStaffChoice(id);
          resetSlot();
        }}
      />
    </Screen>
  );
}

function PickerButton({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: typeof User;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="border-border bg-card min-h-[48px] flex-row items-center justify-between rounded-lg border px-3.5 py-3 active:border-primary"
    >
      <View className="flex-1 flex-row items-center gap-2.5 pr-2">
        <Icon as={icon} size={18} className="text-primary" />
        <View className="flex-1">
          <Text className="text-foreground text-sm font-medium">{label}</Text>
          {detail ? (
            <Text className="text-muted-foreground text-xs">{detail}</Text>
          ) : null}
        </View>
      </View>
      <Icon as={ChevronDown} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}
