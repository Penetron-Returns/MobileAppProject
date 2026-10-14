import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { AppointmentListItem } from '@/features/appointments/hooks';
import { useDepth } from '@/hooks/useDepth';
import { withAlpha } from '@/lib/depth';
import { formatTime } from '@/lib/time';

import { blockTone, type BlockTone } from '../logic';

/** Tall enough to show the time line under the service. */
const TIME_LINE_MIN_HEIGHT = 64;

/** One booking in a staff column. Tap opens the booking; there is no dragging in v1. */
export function AppointmentBlock({
  appointment,
  timezone,
  height,
}: {
  appointment: AppointmentListItem;
  timezone: string;
  height: number;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const tone = blockTone(appointment);
  const { accent, fill } = toneColors(tone, depth);
  const client = appointment.client.name ?? t('calendar.unknownClient');
  const time = t('calendar.timeRange', {
    start: formatTime(appointment.starts_at, timezone),
    end: formatTime(appointment.ends_at, timezone),
  });
  const service = appointment.service.name;

  return (
    <Pressable
      onPress={() => router.push(`/bookings/${appointment.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={t('calendar.blockLabel', {
        client,
        service,
        time,
        status: t(`calendar.tone.${tone}`),
      })}
      style={{ height, backgroundColor: fill }}
      className="overflow-hidden rounded-xl active:opacity-70"
    >
      <View
        style={{ backgroundColor: accent }}
        className="absolute bottom-0 left-0 top-0 w-1"
      />
      <View className="min-w-0 flex-1 py-1.5 pl-3 pr-2">
        <Text numberOfLines={1} className="text-subtitle font-semibold">
          {client}
        </Text>
        <Text numberOfLines={1} className="text-meta text-muted-foreground">
          {service}
        </Text>
        {height >= TIME_LINE_MIN_HEIGHT ? (
          <Text
            numberOfLines={1}
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-meta text-muted-foreground"
          >
            {time}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function toneColors(tone: BlockTone, depth: ReturnType<typeof useDepth>) {
  const { colors } = depth;
  switch (tone) {
    case 'arrived':
      return { accent: colors.green, fill: withAlpha(colors.green, 0.14) };
    case 'noShow':
      return { accent: colors.amber, fill: colors.amberFill };
    case 'done':
      return {
        accent: colors.inactive,
        fill: withAlpha(colors.label, 0.06),
      };
    default:
      return { accent: colors.tint, fill: withAlpha(colors.tint, 0.14) };
  }
}
