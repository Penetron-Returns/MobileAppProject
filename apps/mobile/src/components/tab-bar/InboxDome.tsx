import { router } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

import { INBOX_DOME_SIZE } from './layout';
import { useInboxEntry } from './useInboxEntry';

/** The floating Inbox dome with its count badge. Renders nothing when the entry is off. */
export function InboxDome() {
  const { t } = useTranslation();
  const depth = useDepth();
  const { isVisible, unreadCount } = useInboxEntry();
  if (!isVisible) return null;

  return (
    <Pressable
      onPress={() => router.navigate('/inbox' as never)}
      accessibilityRole="button"
      accessibilityLabel={t('inbox.domeLabel', { count: unreadCount })}
      style={({ pressed }) => [
        depth.domeFloat,
        {
          width: INBOX_DOME_SIZE,
          height: INBOX_DOME_SIZE,
          borderRadius: INBOX_DOME_SIZE / 2,
        },
        pressed && depth.buttonPressed,
      ]}
      className="items-center justify-center"
    >
      <Inbox size={26} strokeWidth={1.8} color={depth.colors.label} />
      {unreadCount > 0 ? (
        <View
          style={depth.badge}
          className="absolute -right-1 -top-1 h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5"
        >
          <Text className="text-meta font-semibold text-white">
            {unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
