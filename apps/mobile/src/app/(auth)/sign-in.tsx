import { AuthView } from '@clerk/expo/native';
import { View } from 'react-native';

import { cn } from '@/lib/utils';

/**
 * Native sign-in screen. Clerk's `AuthView` renders the whole flow (email,
 * OTP, social, MFA) — there is no custom auth form anywhere in this app.
 * `mode="signInOrUp"` so new users can create an account as well as sign in.
 */
export default function SignInScreen() {
  return (
    <View className={cn('flex-1 bg-background')}>
      <AuthView mode="signInOrUp" isDismissible={false} />
    </View>
  );
}
