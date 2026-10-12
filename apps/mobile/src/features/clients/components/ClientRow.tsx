import { useRouter } from 'expo-router';
import { AlertCircle, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { PersonAvatar } from '@/components/PersonAvatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatPhone } from '@/lib/format';
import { formatRelativeDate, formatTime, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';

import type { ClientListItem } from '../hooks';
import { summariseVisits, VIP_TAG } from '../logic';

export function ClientRow({
  client,
  timezone,
  isLast,
}: {
  client: ClientListItem;
  timezone: string;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const name = client.name ?? formatPhone(client.phone_e164);
  const { todayAt, lastVisitDate } = summariseVisits(
    client.appointments,
    new Date(),
    timezone,
  );
  const isVip = client.tags.includes(VIP_TAG);
  const subtitle = todayAt
    ? t('clients.appointmentToday', {
        time: formatTime(todayAt, timezone, true),
      })
    : lastVisitDate
      ? t('clients.lastVisit', {
          when: formatRelativeDate(lastVisitDate, todayISO(timezone)),
        })
      : t('clients.noVisits');

  return (
    <Pressable
      onPress={() => router.push(`/clients/${client.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${subtitle}`}
      className={cn(
        'relative flex-row items-center p-4 active:bg-muted/50',
        !isLast && 'border-border border-b',
      )}
    >
      {todayAt ? (
        <View className="bg-primary absolute bottom-0 left-0 top-0 w-1" />
      ) : null}
      <View className={cn(todayAt && 'pl-1.5')}>
        <PersonAvatar name={name} />
      </View>
      <View className="ml-3.5 flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="text-foreground shrink text-base font-semibold"
          >
            {name}
          </Text>
          {isVip ? (
            <View className="bg-primary/10 rounded-full px-2 py-0.5">
              <Text className="text-primary text-[10px] font-bold uppercase">
                {t('clients.vip')}
              </Text>
            </View>
          ) : null}
        </View>
        {todayAt ? (
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Icon as={AlertCircle} size={14} className="text-status-pending" />
            <Text className="text-status-pending text-xs font-semibold">
              {subtitle}
            </Text>
          </View>
        ) : (
          <Text className="text-muted-foreground mt-0.5 text-xs">
            {subtitle}
          </Text>
        )}
      </View>
      <Icon as={ChevronRight} size={20} className="text-muted-foreground/60" />
    </Pressable>
  );
}
