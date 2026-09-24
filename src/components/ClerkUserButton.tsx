import { UserButton as NativeUserButton } from '@clerk/expo/native';

/** Avatar button that opens Clerk's native user-profile view. iOS/Android only. */
export function ClerkUserButton() {
  return <NativeUserButton />;
}
