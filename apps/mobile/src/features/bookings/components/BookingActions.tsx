import { Button, Text, useDepth } from '@booking/ui';
import { router } from 'expo-router';
import { Check, ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import {
  useCheckInAppointment,
  useSetAppointmentStatus,
  type AppointmentDetail,
} from '@/features/appointments/hooks';
import { toast } from '@/lib/toast';
import { primaryAction } from '../logic';

export function PrimaryAction({
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

export function MoreActions({
  appointment,
}: {
  appointment: AppointmentDetail;
}) {
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
        <Text style={{ color: depth.colors.red }} className="text-title">
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
