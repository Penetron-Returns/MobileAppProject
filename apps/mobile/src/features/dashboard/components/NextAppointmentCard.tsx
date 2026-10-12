import { CheckCircle2, Clock } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCheckInAppointment } from '@/features/appointments/hooks';
import { formatDuration } from '@/lib/format';
import { formatTime } from '@/lib/time';
import { toast } from '@/lib/toast';

import type { ScheduleAppointment } from '../hooks';

export function NextAppointmentCard({
  appointment,
  timezone,
}: {
  appointment: ScheduleAppointment | null;
  timezone: string;
}) {
  const { t } = useTranslation();
  const clientName = appointment?.client.name ?? t('dashboard.unknownClient');
  const checkIn = useCheckInAppointment({
    onSuccess: () =>
      toast.success(t('dashboard.checkedIn', { name: clientName })),
  });

  return (
    <View className="bg-primary relative min-h-[196px] justify-between overflow-hidden rounded-2xl p-5 shadow-md">
      <View className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full bg-white/10" />
      <View className="z-10">
        <View className="mb-1 flex-row items-center gap-1.5">
          <Icon as={Clock} size={14} className="text-primary-foreground/90" />
          <Text className="text-primary-foreground/90 text-xs font-bold uppercase tracking-wider">
            {t('dashboard.nextAppointment')}
          </Text>
        </View>
        {appointment ? (
          <>
            <Text className="text-primary-foreground text-3xl font-bold">
              {formatTime(appointment.starts_at, timezone, true)}
            </Text>
            <Text className="text-primary-foreground/95 mt-1 text-base font-semibold">
              {clientName}
            </Text>
            <Text className="text-primary-foreground/80 mt-0.5 text-sm">
              {t('dashboard.serviceLine', {
                service: appointment.service.name,
                duration: formatDuration(appointment.duration_minutes),
              })}
            </Text>
          </>
        ) : (
          <Text className="text-primary-foreground mt-2 text-lg font-semibold">
            {t('dashboard.noNextAppointment')}
          </Text>
        )}
      </View>
      {appointment ? (
        <Pressable
          onPress={() => checkIn.mutate(appointment.id)}
          disabled={checkIn.isPending}
          className="z-10 mt-4 min-h-[44px] flex-row items-center gap-2 self-start rounded-lg bg-white/20 px-4 py-2 active:bg-white/30"
          accessibilityRole="button"
          accessibilityState={{ busy: checkIn.isPending }}
        >
          <Icon as={CheckCircle2} size={16} className="text-white" />
          <Text className="text-xs font-semibold text-white">
            {t('dashboard.checkIn')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
