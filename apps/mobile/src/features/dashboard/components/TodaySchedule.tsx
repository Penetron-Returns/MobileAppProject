import {
  Avatar,
  Capsule,
  EmptyState,
  Pressable,
  Surface,
  Text,
  useDepth,
} from '@booking/ui';
import { router } from 'expo-router';
import { CalendarDays, MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { formatDuration } from '@/lib/format';
import { formatTime } from '@/lib/time';
import { toast } from '@/lib/toast';

import type { ScheduleAppointment } from '../hooks';
import { whatsAppChatUrl } from '../logic';

export function TodaySchedule({
  appointments,
  nextId,
  timezone,
}: {
  appointments: ScheduleAppointment[];
  nextId: string | null;
  timezone: string;
}) {
  const { t } = useTranslation();
  if (appointments.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={CalendarDays}
        title={t('dashboard.emptySchedule.title')}
        description={t('dashboard.emptySchedule.description')}
      />
    );
  }
  return (
    <Surface variant="raised" radius={22} className="overflow-hidden">
      {appointments.map((appointment) => (
        <ScheduleRow
          key={appointment.id}
          appointment={appointment}
          isNext={appointment.id === nextId}
          timezone={timezone}
        />
      ))}
    </Surface>
  );
}

function ScheduleRow({
  appointment,
  isNext,
  timezone,
}: {
  appointment: ScheduleAppointment;
  isNext: boolean;
  timezone: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const name = appointment.client?.name ?? t('dashboard.unknownClient');
  const phone = appointment.client?.phone_e164;
  const canMessage = appointment.status === 'confirmed' && Boolean(phone);

  const openWhatsApp = () => {
    if (!phone) return;
    Linking.openURL(
      whatsAppChatUrl(phone, t('dashboard.whatsAppGreeting', { name })),
    ).catch(() => toast.info(t('dashboard.openingWhatsApp', { name })));
  };

  return (
    <Pressable
      onPress={() => router.push(`/bookings/${appointment.id}` as never)}
      className="min-h-[76px] flex-row items-center px-4"
      accessibilityRole="button"
    >
      <View className="mr-3 w-14 items-center">
        <Text
          style={{
            color: isNext ? depth.colors.tint : depth.colors.secondary,
            fontVariant: ['tabular-nums'],
          }}
          className={isNext ? 'text-subtitle font-bold' : 'text-subtitle'}
        >
          {formatTime(appointment.starts_at, timezone)}
        </Text>
      </View>
      <Avatar
        name={name}
        size="md"
        tone={isNext ? 'tint' : 'neutral'}
        className="mr-3"
      />
      <View className="min-w-0 flex-1 justify-center">
        <Text numberOfLines={1} className="text-title font-semibold">
          {name}
        </Text>
        <Text numberOfLines={1} className="text-subtitle text-muted-foreground">
          {t('dashboard.serviceLine', {
            service: appointment.service?.name ?? '',
            duration: formatDuration(appointment.duration_minutes),
          })}
        </Text>
      </View>
      <View className="ml-3 flex-row items-center gap-1">
        {isNext ? <Capsule label={t('dashboard.next')} /> : null}
        {!isNext && appointment.checked_in_at ? (
          <Capsule tone="green" label={t('dashboard.checkedInBadge')} />
        ) : null}
        {canMessage ? (
          <Pressable
            onPress={openWhatsApp}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.messageOnWhatsApp', { name })}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <MessageCircle size={18} color={depth.colors.green} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
