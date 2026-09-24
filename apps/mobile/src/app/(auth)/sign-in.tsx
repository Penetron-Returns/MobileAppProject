import { AuthView } from '@clerk/expo/native';
import { View } from 'react-native';

import { cn } from '@/lib/utils';

/**
 * Native sign-in screen. Clerk's `AuthView` renders the whole flow (email,
 * OTP, social, MFA) — there is no custom auth form anywhere in this app.
 * `mode="signIn"` because staff accounts are issued by an owner, never
 * self-registered.
 */
export default function SignInScreen() {
  return (
    <View className={cn('flex-1 bg-background')}>
      <AuthView mode="signIn" isDismissible={false} />
    </View>
  );
}
