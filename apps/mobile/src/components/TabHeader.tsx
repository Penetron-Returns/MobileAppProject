import { Bell } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Header } from '@/components/Header';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';

/** Header shared by the top-level tabs. */
export function TabHeader() {
  const { t } = useTranslation();
  return (
    <Header
      title={t('dashboard.title')}
      hideBack
      right={
        <Pressable
          onPress={() => toast.info(t('dashboard.noNotifications'))}
          className="relative h-11 w-11 items-center justify-center rounded-full active:bg-accent"
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.notifications')}
        >
          <Icon as={Bell} size={20} className="text-foreground" />
        </Pressable>
      }
    />
  );
}
