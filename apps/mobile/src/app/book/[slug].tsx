import { EmptyState, Screen } from '@booking/ui';
import { useLocalSearchParams } from 'expo-router';
import { Globe } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

/**
 * Public web-booking comparator (`docs/BUILD_PLAN.md` §4, `/public/b/:slug`).
 * Outside both the `(auth)` and `(app)` groups — no sign-in required.
 */
export default function PublicBookingScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return (
    <Screen>
      <EmptyState
        icon={Globe}
        title={t('publicBooking.title')}
        description={t('publicBooking.description', { slug })}
      />
    </Screen>
  );
}
