import { CenteredSpinner } from '@booking/ui';
import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';

/** Public group: sign-in only (accounts are issued, so no sign-up route). */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  if (!isLoaded) return <CenteredSpinner />;
  if (isSignedIn) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
