import { Pressable, Surface, Text, useDepth } from '@booking/ui';
import { CheckCircle2, Clock } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

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
  const depth = useDepth();
  const clientName = appointment?.client?.name ?? t('dashboard.unknownClient');
  const checkIn = useCheckInAppointment({
    onSuccess: () =>
      toast.success(t('dashboard.checkedIn', { name: clientName })),
  });
  const onFill = depth.colors.onFill;

  return (
    <Surface
      variant="raised"
      radius={22}
      style={{ backgroundColor: depth.colors.tint }}
      className="min-h-[196px] justify-between p-5"
    >
      <View>
        <View className="mb-1 flex-row items-center gap-1.5">
          <Clock size={14} color={onFill} />
          <Text
            style={{ color: onFill }}
            className="text-subtitle font-semibold"
          >
            {t('dashboard.nextAppointment')}
          </Text>
        </View>
        {appointment ? (
          <>
            <Text
              style={{ color: onFill, fontVariant: ['tabular-nums'] }}
              className="text-[32px] font-bold leading-[38px]"
            >
              {formatTime(appointment.starts_at, timezone, true)}
            </Text>
            <Text
              style={{ color: onFill }}
              className="mt-1 text-title font-semibold"
            >
              {clientName}
            </Text>
            <Text
              style={{ color: onFill, opacity: 0.85 }}
              className="mt-0.5 text-subtitle"
            >
              {t('dashboard.serviceLine', {
                service: appointment.service?.name ?? '',
                duration: formatDuration(appointment.duration_minutes),
              })}
            </Text>
          </>
        ) : (
          <Text
            style={{ color: onFill }}
            className="mt-2 text-title font-semibold"
          >
            {t('dashboard.noNextAppointment')}
          </Text>
        )}
      </View>
      {appointment ? (
        <Pressable
          onPress={() => checkIn.mutate(appointment.id)}
          disabled={checkIn.isPending}
          className="mt-4 min-h-[44px] flex-row items-center gap-2 self-start rounded-full bg-white/20 px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.checkIn')}
          accessibilityState={{ busy: checkIn.isPending }}
        >
          <CheckCircle2 size={16} color={onFill} />
          <Text
            style={{ color: onFill }}
            className="text-subtitle font-semibold"
          >
            {t('dashboard.checkIn')}
          </Text>
        </Pressable>
      ) : null}
    </Surface>
  );
}
