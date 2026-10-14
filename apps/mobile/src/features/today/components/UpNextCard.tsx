import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCheckInAppointment } from '@/features/appointments/hooks';
import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { useDepth } from '@/hooks/useDepth';
import { formatDuration } from '@/lib/format';
import { formatTime } from '@/lib/time';
import { toast } from '@/lib/toast';

import { upNextTiming, type TodayAppointment } from '../logic';

/** The hero card: the booking that is next (or under way) with Check in and Message. */
export function UpNextCard({
  appointment,
  now,
  timezone,
}: {
  appointment: TodayAppointment;
  now: Date;
  timezone: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const name = appointment.client?.name ?? t('today.unknownClient');
  const checkIn = useCheckInAppointment({
    onSuccess: () => toast.success(t('today.checkedInToast', { name })),
  });

  const timing = upNextTiming(appointment, now);
  const time = formatTime(appointment.starts_at, timezone);
  const when =
    timing.kind === 'arrived'
      ? t('today.when.arrived')
      : timing.kind === 'now'
        ? t('today.when.now', { time })
        : t('today.when.in', {
            time,
            duration: formatDuration(timing.minutes),
          });
  const isArrived = timing.kind === 'arrived';

  const openWhatsApp = () => {
    if (!appointment.client) return;
    const url = whatsAppChatUrl(
      appointment.client.phone_e164,
      t('today.whatsAppGreeting', { name }),
    );
    Linking.openURL(url).catch(() =>
      toast.info(t('today.openingWhatsApp', { name })),
    );
  };

  return (
    <Surface variant="hero" className="mx-5 mt-5 px-4 pb-4 pt-[18px]">
      <View className="flex-row items-center justify-between">
        <Text className="text-subtitle font-semibold text-muted-foreground">
          {t('today.upNext')}
        </Text>
        <Text
          style={{
            color: isArrived ? depth.colors.green : depth.colors.secondary,
            fontVariant: ['tabular-nums'],
          }}
          className="text-subtitle font-semibold"
        >
          {when}
        </Text>
      </View>
      <Text numberOfLines={1} className="mt-2 text-section font-semibold">
        {name}
      </Text>
      <Text numberOfLines={1} className="text-subtitle text-muted-foreground">
        {appointment.staff
          ? t('today.serviceWithStaff', {
              service: appointment.service?.name ?? '',
              staff: appointment.staff.name,
            })
          : (appointment.service?.name ?? '')}
      </Text>

      {isArrived ? (
        <View className="mt-3.5 flex-row items-center gap-1.5">
          <Check size={20} strokeWidth={2.6} color={depth.colors.green} />
          <Text
            style={{ color: depth.colors.green }}
            className="text-title font-semibold"
          >
            {t('today.checkedIn')}
          </Text>
        </View>
      ) : (
        <Button
          size="lg"
          className="mt-4 w-full"
          disabled={checkIn.isPending}
          onPress={() => checkIn.mutate(appointment.id)}
          accessibilityLabel={t('today.checkInLabel', { name })}
          accessibilityState={{ busy: checkIn.isPending }}
        >
          <Text className="text-title">{t('today.checkIn')}</Text>
        </Button>
      )}

      {appointment.client ? (
        <Pressable
          onPress={openWhatsApp}
          accessibilityRole="button"
          accessibilityLabel={t('today.messageLabel', { name })}
          className="mt-1 h-12 items-center justify-center active:opacity-50"
        >
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {t('today.message')}
          </Text>
        </Pressable>
      ) : null}
    </Surface>
  );
}
