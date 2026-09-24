import { useLocalSearchParams } from 'expo-router';
import { Globe } from 'lucide-react-native';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

/**
 * Public web-booking comparator (`docs/BUILD_PLAN.md` §4, `/public/b/:slug`).
 * Outside both the `(auth)` and `(app)` groups — no sign-in required.
 */
export default function PublicBookingScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return (
    <Screen>
      <EmptyState
        icon={Globe}
        title="Coming soon"
        description={`The web booking page for "${slug}" will live here.`}
      />
    </Screen>
  );
}
