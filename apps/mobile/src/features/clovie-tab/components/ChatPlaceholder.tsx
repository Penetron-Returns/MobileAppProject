import { IconButton, Pressable, Text, useAppColorScheme } from '@booking/ui';
import { Mic } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

const LIGHT = require('@/assets/images/companion-default.png');
const DARK = require('@/assets/images/companion-default-dark.png');

/**
 * Stands in for Nerova's `<CompanionMoment>` (one exchange, queue, composer),
 * which owns the chat UI. Their SDK only offers the sheet today, so this is a
 * still Clovie, an "Ask Clovie anything" row that opens the sheet, and a mic.
 * Swap this whole component for `<CompanionMoment>` when it ships.
 */
export function ChatPlaceholder({
  onOpenChat,
  onStartVoice,
}: {
  onOpenChat: () => void;
  onStartVoice: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  return (
    <View className="flex-1 justify-end px-5 pb-2 pt-4">
      <View className="flex-1 items-center justify-center">
        <Image
          testID="clovie-placeholder-image"
          source={isDark ? DARK : LIGHT}
          accessibilityElementsHidden
          importantForAccessibility="no"
          resizeMode="contain"
          style={{ width: 160, height: 160 }}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onOpenChat}
          accessibilityRole="button"
          accessibilityLabel={t('clovieTab.ask')}
          accessibilityHint={t('clovieTab.askHint')}
          className="min-h-12 flex-1 justify-center rounded-full bg-secondary px-5"
        >
          <Text className="text-body text-muted-foreground">
            {t('clovieTab.ask')}
          </Text>
        </Pressable>
        <IconButton
          icon={Mic}
          label={t('clovieTab.talk')}
          tone="tint"
          onPress={onStartVoice}
        />
      </View>
    </View>
  );
}
