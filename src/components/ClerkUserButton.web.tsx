import { UserButton as WebUserButton } from '@clerk/expo/web';

/** Clerk's prebuilt web dropdown user button (avatar, profile, sign out). */
export function ClerkUserButton() {
  return <WebUserButton />;
}
