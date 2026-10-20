import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';

import { ClovieLoading } from '@/features/brand/ClovieLoading';
import { useHideSplashWhen } from '@/features/brand/useHideSplash';

/** Public group: sign-in only (accounts are issued, so no sign-up route). */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  useHideSplashWhen(isLoaded);
  if (!isLoaded) return <ClovieLoading />;
  if (isSignedIn) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
