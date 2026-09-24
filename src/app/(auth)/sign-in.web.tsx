import { SignIn } from '@clerk/expo/web';
import { View } from 'react-native';

/** Web sign-in screen: Clerk's prebuilt web component, hash-routed so it
 * doesn't need its own catch-all route inside Expo Router. */
export default function SignInScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <SignIn routing="hash" signUpUrl={undefined} />
    </View>
  );
}
