import { Surface, Text, Turn, useDepth } from '@booking/ui';
import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useAppointmentEvents } from '@/features/appointments/hooks';
import { isFailed } from '@/lib/offline';
import { businessDate, formatDateShort, formatTime } from '@/lib/time';
import { HISTORY_EVENTS } from '../logic';

export function History({
  appointmentId,
  timezone,
}: {
  appointmentId: string;
  timezone: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [open, setOpen] = React.useState(false);
  const events = useAppointmentEvents(appointmentId);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('booking.history')}
        className="min-h-12 flex-row items-center gap-1.5"
      >
        <Text style={{ color: depth.colors.tint }} className="text-title">
          {t('booking.history')}
        </Text>
        <Turn open={open}>
          <ChevronDown size={16} strokeWidth={2.6} color={depth.colors.tint} />
        </Turn>
      </Pressable>
      {open ? (
        <Surface variant="raised" className="px-4 py-1">
          {isFailed(events) ? (
            <Text className="py-3 text-subtitle text-muted-foreground">
              {t('booking.historyFailed')}
            </Text>
          ) : null}
          {(events.data ?? [])
            .filter((e) =>
              (HISTORY_EVENTS as readonly string[]).includes(e.type),
            )
            .map((e, index) => (
              <View
                key={e.id}
                className="min-h-12 flex-row items-center justify-between gap-3"
              >
                {index > 0 ? (
                  <Surface
                    variant="engrave"
                    className="absolute left-0 right-0 top-0 h-0.5"
                  />
                ) : null}
                <Text className="flex-1 text-title">
                  {t(`booking.event.${e.type}`)}
                </Text>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-meta text-muted-foreground"
                >
                  {`${formatDateShort(businessDate(e.occurred_at, timezone))} ${formatTime(e.occurred_at, timezone)}`}
                </Text>
              </View>
            ))}
        </Surface>
      ) : null}
    </View>
  );
}
