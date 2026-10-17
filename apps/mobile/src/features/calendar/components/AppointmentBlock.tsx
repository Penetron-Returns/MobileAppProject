import { RowContextMenu, Text, useDepth, useRowActionProps } from '@booking/ui';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { AppointmentListItem } from '@/features/appointments/hooks';
import { bookingMenuActions } from '@/features/appointments/menuActions';
import { formatTime } from '@/lib/time';

import { BLOCK_RADIUS, BLOCK_TEXT, blockFill } from '../grid';
import { blockTone } from '../logic';

/** Tall enough to show the time line under the service. */
const TIME_LINE_MIN_HEIGHT = 64;

/**
 * One booking in a staff column: a solid, opaque block that stretches from its
 * start line to its end line. Tap opens the booking; a long press lifts it
 * into a menu (Open, Reschedule, Message, Cancel). There is no dragging in v1.
 * Only existing blocks have a menu: long-pressing an empty slot is the column's
 * own manual-booking fallback.
 */
export function AppointmentBlock(props: BlockProps) {
  const { t } = useTranslation();
  const { appointment } = props;
  const actions = React.useMemo(
    () => bookingMenuActions(appointment, t),
    [appointment, t],
  );
  return (
    <RowContextMenu actions={actions} previewRadius={BLOCK_RADIUS}>
      <BlockBody {...props} />
    </RowContextMenu>
  );
}

interface BlockProps {
  appointment: AppointmentListItem;
  timezone: string;
  height: number;
}

function BlockBody({ appointment, timezone, height }: BlockProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const rowActions = useRowActionProps();
  const tone = blockTone(appointment);
  const fill = blockFill(tone, depth.scheme);
  const client = appointment.client.name ?? t('calendar.unknownClient');
  const time = t('calendar.timeRange', {
    start: formatTime(appointment.starts_at, timezone),
    end: formatTime(appointment.ends_at, timezone),
  });
  const service = appointment.service.name;
  const onFill = { color: BLOCK_TEXT };

  return (
    <Pressable
      onPress={() => router.push(`/bookings/${appointment.id}` as never)}
      {...rowActions}
      accessibilityRole="button"
      accessibilityLabel={t('calendar.blockLabel', {
        client,
        service,
        time,
        status: t(`calendar.tone.${tone}`),
      })}
      style={{ height, backgroundColor: fill, borderRadius: BLOCK_RADIUS }}
      className="overflow-hidden active:opacity-80"
    >
      {appointment.client_confirmed_at ? (
        <View
          accessible
          accessibilityLabel={t('clientConfirmed.label')}
          style={{ backgroundColor: BLOCK_TEXT }}
          className="absolute right-1.5 top-1.5 h-[18px] w-[18px] items-center justify-center rounded-full"
        >
          <Check size={11} strokeWidth={3} color={fill} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 px-2 py-1">
        <Text
          numberOfLines={1}
          style={onFill}
          className="text-subtitle font-semibold"
        >
          {client}
        </Text>
        <Text numberOfLines={1} style={onFill} className="text-meta">
          {service}
        </Text>
        {height >= TIME_LINE_MIN_HEIGHT ? (
          <Text
            numberOfLines={1}
            style={[onFill, { fontVariant: ['tabular-nums'] }]}
            className="text-meta"
          >
            {time}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
