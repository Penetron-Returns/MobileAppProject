import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';

import { CenteredSpinner } from '@/components/States';

/** Public group: sign-in only (accounts are issued, so no sign-up route). */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  if (!isLoaded) return <CenteredSpinner />;
  if (isSignedIn) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
