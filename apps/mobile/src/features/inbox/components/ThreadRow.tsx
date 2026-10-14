import { Avatar, Capsule, cn, Surface, Text } from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatPhone } from '@/lib/format';
import {
  businessDate,
  formatDateShort,
  formatTime,
  todayISO,
} from '@/lib/time';

import type { InboxThread } from '../hooks';
import { messageText, needsReply } from '../logic';

/** "10:12" today, otherwise "Tue, Oct 13". */
function whenLabel(iso: string | null, timezone: string, now: Date): string {
  if (!iso) return '';
  const date = businessDate(iso, timezone);
  return date === todayISO(timezone, now)
    ? formatTime(iso, timezone)
    : formatDateShort(date);
}

export function ThreadRow({
  thread,
  timezone,
  now,
  showSeparator,
}: {
  thread: InboxThread;
  timezone: string;
  now: Date;
  showSeparator: boolean;
}) {
  const { t } = useTranslation();
  const name = thread.client.name ?? formatPhone(thread.client.phone_e164);
  const needs = needsReply(thread);
  const last = thread.messages[0];
  const text = last ? messageText(last.body) : null;
  const preview = text
    ? last.direction === 'out' && !needs
      ? t('inbox.botPrefix', { text })
      : text
    : t('inbox.noText');
  const when = whenLabel(thread.last_message_at, timezone, now);
  return (
    <Pressable
      onPress={() => router.push(`/inbox/${thread.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        needs ? t('inbox.needsReply') : null,
        when,
        preview,
      ]
        .filter(Boolean)
        .join(', ')}
      className="min-h-[64px] flex-row items-center gap-3 px-4 py-2 active:bg-muted"
    >
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-[72px] right-0 top-0 h-0.5"
        />
      ) : null}
      <Avatar name={name} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text
            numberOfLines={1}
            className={cn('shrink text-title', needs && 'font-semibold')}
          >
            {name}
          </Text>
          <Text className="text-meta text-muted-foreground">{when}</Text>
        </View>
        <Text numberOfLines={1} className="text-subtitle text-muted-foreground">
          {preview}
        </Text>
        {needs ? (
          <Capsule
            tone="amber"
            label={t('inbox.needsReply')}
            className="mt-1 self-start"
          />
        ) : null}
      </View>
    </Pressable>
  );
}
