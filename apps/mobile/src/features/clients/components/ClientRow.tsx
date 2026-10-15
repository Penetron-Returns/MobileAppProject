import {
  Avatar,
  Capsule,
  RowContextMenu,
  Surface,
  Text,
  useDepth,
  useRowActionProps,
} from '@booking/ui';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatPhone } from '@/lib/format';
import { formatRelativeDate, formatTime, todayISO } from '@/lib/time';

import type { ClientListItem } from '../hooks';
import { clientMenuActions } from '../menuActions';
import { isRegular, noShowCount, summariseVisits, VIP_TAG } from '../logic';

const NO_SHOWS_WORTH_SHOWING = 2;

/** One client in the list: dome avatar, name, last visit, quiet labels. */
export function ClientRow(props: ClientRowProps) {
  const { t } = useTranslation();
  const { client } = props;
  const actions = React.useMemo(
    () =>
      clientMenuActions(
        client,
        client.name ?? formatPhone(client.phone_e164),
        t,
      ),
    [client, t],
  );
  return (
    <RowContextMenu actions={actions}>
      <ClientRowBody {...props} />
    </RowContextMenu>
  );
}

interface ClientRowProps {
  client: ClientListItem;
  timezone: string;
  showSeparator: boolean;
  now: Date;
}

function ClientRowBody({
  client,
  timezone,
  showSeparator,
  now,
}: ClientRowProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const depth = useDepth();
  const rowActions = useRowActionProps();
  const name = client.name ?? formatPhone(client.phone_e164);
  const { todayAt, lastVisitDate } = summariseVisits(
    client.appointments,
    now,
    timezone,
  );
  const isVip = client.tags.includes(VIP_TAG);
  const regular = isRegular(client.appointments, now);
  const noShows = noShowCount(client.appointments);
  const showNoShows = noShows >= NO_SHOWS_WORTH_SHOWING;
  const subtitle = todayAt
    ? t('clients.appointmentToday', {
        time: formatTime(todayAt, timezone),
      })
    : lastVisitDate
      ? t('clients.lastVisit', {
          when: formatRelativeDate(lastVisitDate, todayISO(timezone, now)),
        })
      : t('clients.noVisits');
  const spoken = [
    name,
    subtitle,
    isVip ? t('clients.vip') : null,
    regular ? t('clients.regular') : null,
    showNoShows ? t('clients.noShows', { count: noShows }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => router.push(`/clients/${client.id}` as never)}
      {...rowActions}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      className="min-h-[60px] flex-row items-center gap-3 px-4 py-1.5 active:bg-muted"
    >
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-[72px] right-0 top-0 h-0.5"
        />
      ) : null}
      <Avatar name={name} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-title">
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={todayAt ? { color: depth.colors.tint } : undefined}
          className="text-subtitle text-muted-foreground"
        >
          {subtitle}
        </Text>
      </View>
      {showNoShows ? (
        <Text
          style={{ color: depth.colors.amber }}
          className="text-meta font-semibold"
        >
          {t('clients.noShows', { count: noShows })}
        </Text>
      ) : null}
      {isVip ? <Capsule label={t('clients.vip')} /> : null}
      {regular ? <Capsule label={t('clients.regular')} /> : null}
      <ChevronRight
        size={16}
        strokeWidth={2.8}
        color={depth.colors.secondary}
      />
    </Pressable>
  );
}
