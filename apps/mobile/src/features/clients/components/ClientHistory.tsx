import {
  Group,
  GroupRow,
  SectionTitle,
  Skeleton,
  Text,
  useDepth,
} from '@booking/ui';
import { useRouter } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { formatDateShort, formatTime, businessDate } from '@/lib/time';

import { useClientAppointments, type ClientAppointment } from '../hooks';
import { clientStats, upcomingAppointments, visitCadenceWeeks } from '../logic';

const COLLAPSED_COUNT = 3;

/** Stats line, "Up next" and the collapsible visit history. */
export function ClientHistory({
  clientId,
  timezone,
  currency,
}: {
  clientId: string;
  timezone: string;
  currency: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const depth = useDepth();
  const history = useClientAppointments(clientId);
  const [expanded, setExpanded] = React.useState(false);

  if (history.isPending) {
    return (
      <View className="mx-5 mt-5 gap-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-14 w-full" />
      </View>
    );
  }
  if (history.isError) {
    return (
      <Pressable
        onPress={() => void history.refetch()}
        accessibilityRole="button"
        className="mx-5 mt-5 min-h-11 justify-center"
      >
        <Text style={{ color: depth.colors.tint }} className="text-title">
          {t('clients.profile.historyFailed')}
        </Text>
      </Pressable>
    );
  }

  const now = new Date();
  const stats = clientStats(history.data);
  const upcoming = upcomingAppointments(history.data, now);
  const past = history.data.filter((a) => !upcoming.includes(a));
  const cadence = visitCadenceWeeks(
    history.data
      .filter((a) => a.status === 'completed')
      .map((a) => a.starts_at),
  );
  const rows = expanded ? past : past.slice(0, COLLAPSED_COUNT);
  const statsLine = [
    t('clients.profile.visits', { count: stats.visits }),
    t('clients.profile.spent', {
      amount: formatMoney(stats.spentCents, currency, { decimals: false }),
    }),
    cadence ? t('clients.profile.cadence', { count: cadence }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const line = (a: ClientAppointment) =>
    `${formatDateShort(businessDate(a.starts_at, timezone))} · ${formatTime(a.starts_at, timezone)} · ${a.staff.name}`;

  return (
    <>
      <Text className="mx-5 mt-4 text-title text-muted-foreground">
        {statsLine}
      </Text>

      {upcoming.length > 0 ? (
        <>
          <SectionTitle>{t('clients.profile.upNext')}</SectionTitle>
          <Group>
            {upcoming.map((a, i) => (
              <GroupRow
                key={a.id}
                showSeparator={i > 0}
                title={a.service.name}
                subtitle={line(a)}
                onPress={() => router.push(`/bookings/${a.id}` as never)}
                accessibilityLabel={t('clients.profile.openBooking', {
                  service: a.service.name,
                  when: line(a),
                })}
              />
            ))}
          </Group>
        </>
      ) : null}

      <SectionTitle>{t('clients.profile.history')}</SectionTitle>
      <Group>
        {past.length === 0 ? (
          <Text className="px-4 py-5 text-title text-muted-foreground">
            {t('clients.profile.noHistory')}
          </Text>
        ) : (
          rows.map((a, i) => (
            <GroupRow
              key={a.id}
              showSeparator={i > 0}
              title={a.service.name}
              subtitle={`${line(a)}${a.status === 'completed' ? '' : ` · ${t(`clients.profile.status.${a.status}`)}`}`}
              detail={formatMoney(a.price_cents, currency, { decimals: false })}
              onPress={() => router.push(`/bookings/${a.id}` as never)}
            />
          ))
        )}
      </Group>
      {!expanded && past.length > COLLAPSED_COUNT ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t('clients.profile.showAll', {
            count: past.length,
          })}
          className="mx-5 min-h-12 flex-row items-center gap-1 px-1 active:opacity-50"
        >
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {t('clients.profile.showAll', { count: past.length })}
          </Text>
          <ChevronDown size={16} strokeWidth={2.4} color={depth.colors.tint} />
        </Pressable>
      ) : null}
    </>
  );
}
