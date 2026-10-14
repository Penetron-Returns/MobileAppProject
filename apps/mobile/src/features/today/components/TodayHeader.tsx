import { Bell } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { toast } from '@/lib/toast';

/** Date caption, the "Today" large title and the notifications bell. */
export function TodayHeader({ caption }: { caption: string | null }) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="flex-row items-end justify-between pl-5 pr-4 pt-1">
      <View>
        <Text className="text-subtitle font-semibold text-muted-foreground">
          {caption ?? ' '}
        </Text>
        <Text
          role="heading"
          aria-level="1"
          className="text-large-title font-bold"
        >
          {t('today.title')}
        </Text>
      </View>
      <Pressable
        onPress={() => toast.info(t('today.noNotifications'))}
        accessibilityRole="button"
        accessibilityLabel={t('today.notifications')}
        className="h-11 w-11 items-center justify-center"
      >
        {({ pressed }) => (
          <View
            style={[
              depth.knob,
              pressed && depth.buttonPressed,
              { borderRadius: 20 },
            ]}
            className="h-10 w-10 items-center justify-center"
          >
            <Bell size={22} strokeWidth={1.8} color={depth.colors.label} />
          </View>
        )}
      </Pressable>
    </View>
  );
}
