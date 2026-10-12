import { useRouter } from 'expo-router';
import { ChevronDown, Clock } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ErrorState, LoadingRows } from '@/components/States';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDuration, formatMoney, formatMoneyCompact } from '@/lib/format';
import {
  formatTime,
  MONTHS_SHORT,
  WEEKDAYS_SHORT,
  zonedParts,
} from '@/lib/time';
import { cn } from '@/lib/utils';

import { useClientAppointments, type ClientAppointment } from '../hooks';
import { clientStats, historyStatus, type HistoryStatus } from '../logic';

const COLLAPSED_COUNT = 3;

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
  const history = useClientAppointments(clientId);
  const [expanded, setExpanded] = React.useState(false);

  if (history.isPending) return <LoadingRows count={3} />;
  if (history.isError) {
    return (
      <ErrorState
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    );
  }

  const stats = clientStats(history.data);
  const rows = expanded ? history.data : history.data.slice(0, COLLAPSED_COUNT);
  const now = new Date();

  return (
    <>
      <View className="flex-row flex-wrap gap-3">
        <StatTile
          label={t('clientProfile.stats.visits')}
          value={String(stats.visits)}
          accent
        />
        <StatTile
          label={t('clientProfile.stats.spent')}
          value={formatMoneyCompact(stats.spentCents, currency)}
          accent
        />
        <StatTile
          label={t('clientProfile.stats.avgSpend')}
          value={formatMoneyCompact(stats.avgSpendCents, currency)}
        />
        <StatTile
          label={t('clientProfile.stats.cancellations')}
          value={`${Math.round(stats.cancellationRate * 100)}%`}
        />
      </View>

      <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
        <View className="border-border flex-row items-center justify-between border-b p-5">
          <View className="flex-row items-center gap-2">
            <Icon as={Clock} size={20} className="text-primary" />
            <Text className="text-foreground text-lg font-bold">
              {t('clientProfile.history')}
            </Text>
          </View>
        </View>
        {history.data.length === 0 ? (
          <Text className="text-muted-foreground p-5 text-sm">
            {t('clientProfile.noHistory')}
          </Text>
        ) : (
          rows.map((item, index) => (
            <HistoryRow
              key={item.id}
              item={item}
              status={historyStatus(item, now)}
              timezone={timezone}
              currency={currency}
              isLast={index === rows.length - 1}
            />
          ))
        )}
        {!expanded && history.data.length > COLLAPSED_COUNT ? (
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel={t('clientProfile.loadMoreHistory')}
            className="bg-muted/30 active:bg-muted/60 border-border min-h-[44px] flex-row items-center justify-center gap-1.5 border-t py-3"
          >
            <Text className="text-primary text-xs font-semibold">
              {t('clientProfile.loadMoreHistory')}
            </Text>
            <Icon as={ChevronDown} size={16} className="text-primary" />
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View className="bg-card border-border min-w-[45%] flex-1 items-center justify-center rounded-2xl border p-4 shadow-sm">
      <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
        {label}
      </Text>
      <Text
        className={cn(
          'mt-1 text-2xl font-bold',
          accent ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </Text>
    </View>
  );
}

const STATUS_STYLE: Record<HistoryStatus, { box: string; text: string }> = {
  upcoming: {
    box: 'bg-success/15 border-success/30 border',
    text: 'text-success',
  },
  confirmed: { box: 'bg-primary/10', text: 'text-primary' },
  completed: { box: 'bg-muted', text: 'text-muted-foreground' },
  cancelled: {
    box: 'bg-destructive/15 border-destructive/30 border',
    text: 'text-destructive',
  },
  no_show: { box: 'bg-status-pending-soft', text: 'text-status-pending' },
};

function HistoryRow({
  item,
  status,
  timezone,
  currency,
  isLast,
}: {
  item: ClientAppointment;
  status: HistoryStatus;
  timezone: string;
  currency: string;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const parts = zonedParts(item.starts_at, timezone);
  const isCancelled = status === 'cancelled';
  const details = [
    `${WEEKDAYS_SHORT[parts.weekday]}, ${formatTime(item.starts_at, timezone, true)}`,
    formatDuration(item.duration_minutes),
    t('clientProfile.withStaff', { name: item.staff.name }),
  ].join(' • ');
  const style = STATUS_STYLE[status];

  return (
    <Pressable
      onPress={() => router.push(`/bookings/${item.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${item.service.name}, ${t(`clientProfile.status.${status}`)}`}
      className={cn(
        'relative flex-row items-center gap-3.5 p-4 active:opacity-75',
        !isLast && 'border-border border-b',
        isCancelled && 'opacity-70',
      )}
    >
      {status === 'upcoming' ? (
        <View className="bg-success absolute bottom-0 left-0 top-0 w-1 rounded-r" />
      ) : null}
      <View className="bg-muted border-border h-14 w-14 items-center justify-center rounded-xl border">
        <Text className="text-primary text-[10px] font-bold uppercase">
          {MONTHS_SHORT[parts.month - 1]}
        </Text>
        <Text className="text-foreground text-base font-bold leading-none">
          {String(parts.day).padStart(2, '0')}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <View className="mb-0.5 flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className={cn(
              'text-foreground shrink text-base font-semibold',
              isCancelled && 'text-muted-foreground line-through',
            )}
          >
            {item.service.name}
          </Text>
          <View className={cn('rounded-full px-2 py-0.5', style.box)}>
            <Text className={cn('text-[10px] font-bold uppercase', style.text)}>
              {t(`clientProfile.status.${status}`)}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} className="text-muted-foreground text-xs">
          {details}
        </Text>
      </View>
      <Text
        className={cn(
          'text-foreground text-sm font-semibold',
          isCancelled && 'text-muted-foreground line-through',
        )}
      >
        {formatMoney(item.price_cents, currency, { decimals: false })}
      </Text>
    </Pressable>
  );
}
