import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';

/** Signed-out entry: welcome, business type and name, then the sign-in screen. */
export default function OnboardingScreen() {
  return <OnboardingFlow isSignedIn={false} />;
}
