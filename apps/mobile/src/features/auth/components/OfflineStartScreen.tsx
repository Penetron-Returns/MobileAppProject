import { ErrorState } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Shown instead of the endless splash when the app opens with no connection:
 * the session and business lookups wait for the network, so say so and offer
 * a retry. The gate leaves this screen by itself when the connection returns.
 */
export function OfflineStartScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="bg-background flex-1 justify-center px-4"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ErrorState
        variant="banner"
        title={t('session.offline.title')}
        description={t('session.offline.hint')}
        onRetry={onRetry}
      />
    </View>
  );
}
