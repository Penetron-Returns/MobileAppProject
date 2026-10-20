import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import * as React from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { analytics } from '@/features/analytics';
import { ClovieLoading } from '@/features/brand/ClovieLoading';
import { readDeviceLocale } from '@/lib/device-locale';

import { useCompleteOnboarding } from '../hooks';
import {
  backTarget,
  buildOnboardingRequest,
  confirmName,
  goBack,
  selectType,
  setName,
  shouldAutoSubmit,
  startScreen,
  type OnboardingDraft,
  type OnboardingScreen,
} from '../logic';
import { clearDraft } from '../storage';
import { useOnboardingDraft } from '../useOnboardingDraft';
import { CreateFailedScreen } from './CreateFailedScreen';
import { NameScreen } from './NameScreen';
import { OnboardingChrome } from './OnboardingShell';
import { StepHost } from './StepHost';
import { TypeScreen } from './TypeScreen';
import { WelcomeScreen } from './WelcomeScreen';

/** Ignore a second tap on a sign-in link for this long (the push is not instant). */
const PUSH_GUARD_MS = 1000;

/**
 * Welcome, business type, name. Signed out, the name's Continue goes on to the
 * app's sign-in screen; signed in (no business yet) it creates the business from
 * the type's template. A confirmed draft that survived sign-in is submitted
 * once, by itself, then cleared. The draft sits in secure storage, so a killed
 * app resumes.
 */
export function OnboardingFlow({
  isSignedIn,
  onDone,
}: {
  isSignedIn: boolean;
  /** Called once the business exists; the app shell then opens the app. */
  onDone?: () => void;
}) {
  const { user } = useUser();
  const ownerName = user?.fullName ?? user?.firstName ?? null;
  const { draft, update } = useOnboardingDraft();
  const [screen, setScreen] = React.useState<OnboardingScreen | null>(null);
  // 1 going on, -1 going back: read on the UI thread by the step transition.
  const direction = useSharedValue(1);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const submit = useCompleteOnboarding();
  const inFlight = React.useRef(false);
  const created = React.useRef(false);
  const pushGuard = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => clearTimeout(pushGuard.current ?? undefined), []);

  // One push to sign-in per tap burst: a double tap must not stack two screens.
  const openSignIn = () => {
    if (pushGuard.current) return;
    pushGuard.current = setTimeout(() => {
      pushGuard.current = null;
    }, PUSH_GUARD_MS);
    router.push('/sign-in');
  };

  React.useEffect(() => {
    if (draft && screen === null) setScreen(startScreen(draft, isSignedIn));
  }, [draft, screen, isSignedIn]);

  React.useEffect(() => {
    if (screen === 'welcome') analytics.track('onboarding_started');
  }, [screen]);

  const go = (next: OnboardingScreen, back = false) => {
    direction.value = back ? -1 : 1;
    setScreen(next);
  };

  const create = React.useCallback(
    async (from: OnboardingDraft) => {
      const request = buildOnboardingRequest(
        from,
        ownerName,
        readDeviceLocale(),
      );
      // One business per draft: never twice, never while one is in flight.
      if (!request || inFlight.current || created.current) return;
      inFlight.current = true;
      setError(null);
      setIsBusy(true);
      try {
        const me = await submit.mutateAsync(request);
        created.current = true;
        analytics.track('business_created');
        analytics.group('business', me.business.id);
        // Move on first; dropping the draft is not on the critical path (best
        // effort, never throws).
        onDone?.();
        void clearDraft();
      } catch (e) {
        setError(e);
      } finally {
        inFlight.current = false;
        setIsBusy(false);
      }
    },
    [ownerName, submit, onDone],
  );

  // Signed in with a confirmed draft (the owner just came back from sign-in).
  React.useEffect(() => {
    if (draft && !error && shouldAutoSubmit(draft, isSignedIn)) {
      void create(draft);
    }
  }, [draft, error, isSignedIn, create]);

  if (!draft || !screen) return <ClovieLoading />;
  if (error) {
    return (
      <CreateFailedScreen error={error} onRetry={() => void create(draft)} />
    );
  }

  const onContinue = () => {
    update(confirmName);
    analytics.track('onboarding_name_entered');
    if (isSignedIn) void create(confirmName(draft));
    else openSignIn();
  };

  let body: React.ReactNode = null;
  if (screen === 'welcome') {
    body = (
      <WelcomeScreen onStart={() => go('type')} onHaveAccount={openSignIn} />
    );
  } else if (screen === 'type') {
    body = (
      <TypeScreen
        selected={draft.typeId}
        onBack={
          backTarget('type', { isSignedIn })
            ? () => {
                analytics.track('onboarding_back');
                go('welcome', true);
              }
            : undefined
        }
        onSelect={(id) => {
          update((d) => selectType(d, id));
          analytics.track('onboarding_type_selected', { type: id });
          go('name');
        }}
      />
    );
  } else if (draft.typeId) {
    body = (
      <NameScreen
        typeId={draft.typeId}
        name={draft.businessName}
        isBusy={isBusy}
        onChangeName={(name) => update((d) => setName(d, name))}
        onBack={() => {
          analytics.track('onboarding_back');
          update(goBack);
          go('type', true);
        }}
        onContinue={onContinue}
      />
    );
  }

  return (
    <OnboardingChrome reserveDots>
      <StepHost stepKey={screen} direction={direction}>
        {body}
      </StepHost>
    </OnboardingChrome>
  );
}
