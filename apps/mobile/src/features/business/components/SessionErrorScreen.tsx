import { Button, ErrorState, Text } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSignOut } from '@/features/auth/useSignOut';
import { describeError } from '@/lib/toast';

/**
 * Full-screen stop for when the API refuses to identify the signed-in user
 * (for example a 401). Rendering this instead of the tabs means no screen
 * mounts and re-requests in a loop; the user can retry once or sign out.
 */
export function SessionErrorScreen({
  error,
  onRetry,
  isRetrying,
}: {
  error: unknown;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-background flex-1 justify-center gap-4 px-4"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ErrorState
        variant="banner"
        {...describeError(error)}
        onRetry={onRetry}
        isRetrying={isRetrying}
      />
      <Button
        variant="secondary"
        size="lg"
        onPress={() => void signOut()}
        accessibilityLabel={t('common.signOut')}
      >
        <Text>{t('common.signOut')}</Text>
      </Button>
    </View>
  );
}
