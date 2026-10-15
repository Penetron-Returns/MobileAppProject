import { Button, Text } from '@booking/ui';
import * as Clipboard from 'expo-clipboard';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toast } from '@/lib/toast';

/**
 * What the owner said to "Hey Clovie", shown above the chat. Nerova's widget
 * cannot take prefilled text yet, so the owner copies it into the chat.
 */
export function HeardBanner({ text }: { text: string }) {
  const { t } = useTranslation();
  const [isHidden, setIsHidden] = React.useState(false);
  if (isHidden) return null;

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    toast.info(t('companion.heard.copied'));
  };

  return (
    <View
      accessibilityLabel={t('companion.heard.label')}
      className="mx-5 mb-2 flex-row items-center gap-2 rounded-2xl bg-secondary px-4 py-3"
    >
      <Text className="min-w-0 flex-1 text-subtitle" numberOfLines={3}>
        {t('companion.heard.prefix', { text })}
      </Text>
      <Button
        variant="secondary"
        size="sm"
        onPress={() => void copy()}
        accessibilityLabel={t('companion.heard.copyLabel')}
      >
        <Text>{t('companion.heard.copy')}</Text>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => setIsHidden(true)}
        accessibilityLabel={t('companion.heard.dismiss')}
      >
        <Text>{t('common.dismiss')}</Text>
      </Button>
    </View>
  );
}
