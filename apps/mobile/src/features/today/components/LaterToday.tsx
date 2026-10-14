import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { setCalendarViewMode } from '@/features/calendar/navigation';
import { useDepth } from '@/hooks/useDepth';
import { formatTime } from '@/lib/time';

import {
  needsConfirming,
  type LaterToday as LaterTodayData,
  type TodayAppointment,
} from '../logic';

function openCalendarDay() {
  setCalendarViewMode('day');
  router.push({
    pathname: '/calendar',
    params: { view: 'day', t: String(Date.now()) },
  } as never);
}

/** "Later today": the next few bookings after the hero, with a link to the rest. */
export function LaterToday({
  later,
  timezone,
}: {
  later: LaterTodayData;
  timezone: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  if (later.rows.length === 0) return null;

  return (
    <View>
      <Text
        role="heading"
        aria-level="2"
        className="mx-5 mb-2 mt-7 text-section font-bold"
      >
        {t('today.laterToday')}
      </Text>
      <Surface variant="raised" className="mx-5 overflow-hidden py-1">
        {later.rows.map((appointment, index) => (
          <LaterRow
            key={appointment.id}
            appointment={appointment}
            timezone={timezone}
            showSeparator={index > 0}
          />
        ))}
      </Surface>
      {later.hiddenCount > 0 ? (
        <Pressable
          onPress={openCalendarDay}
          accessibilityRole="link"
          accessibilityLabel={t('today.seeAllLabel')}
          className="mx-5 min-h-12 flex-row items-center gap-1 px-1 active:opacity-50"
        >
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {t('today.seeAllMore', { count: later.hiddenCount })}
          </Text>
          <ChevronRight size={14} strokeWidth={3} color={depth.colors.tint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function LaterRow({
  appointment,
  timezone,
  showSeparator,
}: {
  appointment: TodayAppointment;
  timezone: string;
  showSeparator: boolean;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const client = appointment.client?.name ?? t('today.unknownClient');
  const service = appointment.service?.name ?? '';
  const time = formatTime(appointment.starts_at, timezone);

  return (
    <Pressable
      onPress={() => router.push(`/bookings/${appointment.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={t('today.bookingLabel', { client, service, time })}
      className="min-h-14 flex-row items-center gap-3.5 px-4 py-1.5 active:bg-muted"
    >
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-4 right-0 top-0 h-0.5"
        />
      ) : null}
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="w-[50px] text-title"
      >
        {time}
      </Text>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-title">
          {client}
        </Text>
        <Text numberOfLines={1} className="text-subtitle text-muted-foreground">
          {service}
        </Text>
      </View>
      {needsConfirming(appointment) ? (
        <View
          style={{
            backgroundColor: depth.colors.amberFill,
            boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.06)',
          }}
          className="rounded-xl px-2.5 py-[3px]"
        >
          <Text
            style={{ color: depth.colors.amber }}
            className="text-meta font-semibold"
          >
            {t('today.needsConfirming')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
