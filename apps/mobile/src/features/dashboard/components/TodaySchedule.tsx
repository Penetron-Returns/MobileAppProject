import { router } from 'expo-router';
import { CalendarDays, MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { PersonAvatar } from '@/components/PersonAvatar';
import { EmptyState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDuration } from '@/lib/format';
import { formatTime } from '@/lib/time';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

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
      <View className="bg-card border-border rounded-2xl border">
        <EmptyState
          icon={CalendarDays}
          title={t('dashboard.emptySchedule.title')}
          description={t('dashboard.emptySchedule.description')}
        />
      </View>
    );
  }
  return (
    <View className="bg-card border-border divide-border overflow-hidden rounded-2xl border divide-y shadow-sm">
      {appointments.map((appointment) => (
        <ScheduleRow
          key={appointment.id}
          appointment={appointment}
          isNext={appointment.id === nextId}
          timezone={timezone}
        />
      ))}
    </View>
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
  const name = appointment.client.name ?? t('dashboard.unknownClient');
  const canMessage = appointment.status === 'confirmed';

  const openWhatsApp = () => {
    const url = whatsAppChatUrl(
      appointment.client.phone_e164,
      t('dashboard.whatsAppGreeting', { name }),
    );
    Linking.openURL(url).catch(() =>
      toast.info(t('dashboard.openingWhatsApp', { name })),
    );
  };

  return (
    <Pressable
      onPress={() => router.push(`/bookings/${appointment.id}` as never)}
      className="relative h-[76px] flex-row items-center px-4 active:bg-accent/40"
      accessibilityRole="button"
    >
      {isNext ? (
        <View className="bg-primary absolute bottom-0 left-0 top-0 w-1 rounded-r" />
      ) : null}
      <View className="mr-3 w-12 items-center">
        <Text
          className={cn(
            'text-xs',
            isNext
              ? 'text-primary font-bold'
              : 'text-muted-foreground font-medium',
          )}
        >
          {formatTime(appointment.starts_at, timezone)}
        </Text>
      </View>
      <PersonAvatar name={name} solid={isNext} size="md" className="mr-3" />
      <View className="flex-1 justify-center">
        <Text numberOfLines={1} className="text-sm font-semibold">
          {name}
        </Text>
        <Text numberOfLines={1} className="text-muted-foreground text-xs">
          {t('dashboard.serviceLine', {
            service: appointment.service.name,
            duration: formatDuration(appointment.duration_minutes),
          })}
        </Text>
      </View>
      <View className="ml-3 flex-row items-center gap-1">
        {isNext ? (
          <View className="bg-primary/10 rounded-full px-2.5 py-0.5">
            <Text className="text-primary text-xs font-semibold">
              {t('dashboard.next')}
            </Text>
          </View>
        ) : (
          <StatusBadge status={appointment.status} />
        )}
        {canMessage ? (
          <Pressable
            onPress={openWhatsApp}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.messageOnWhatsApp', { name })}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
          >
            <Icon as={MessageCircle} size={18} className="text-whatsapp" />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}
