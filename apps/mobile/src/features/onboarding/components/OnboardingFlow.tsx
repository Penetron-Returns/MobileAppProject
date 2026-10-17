import { Ground } from '@booking/ui';
import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import * as React from 'react';
import Animated, {
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
} from 'react-native-reanimated';

import { analytics } from '@/features/analytics';
import { ClovieLoading } from '@/features/brand/ClovieLoading';

import { useCompleteOnboarding } from '../hooks';
import {
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
import { TypeScreen } from './TypeScreen';
import { WelcomeScreen } from './WelcomeScreen';

/** Screens slide in from the right going on, from the left going back (300ms). */
const FORWARD = SlideInRight.duration(300).reduceMotion(ReduceMotion.System);
const BACKWARD = SlideInLeft.duration(300).reduceMotion(ReduceMotion.System);

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
  /** Called once the business exists; the app shell then moves on to the plan. */
  onDone?: () => void;
}) {
  const { user } = useUser();
  const ownerName = user?.fullName ?? user?.firstName ?? null;
  const { draft, update } = useOnboardingDraft();
  const [screen, setScreen] = React.useState<OnboardingScreen | null>(null);
  const [isBack, setIsBack] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const submit = useCompleteOnboarding();
  const inFlight = React.useRef(false);
  const created = React.useRef(false);

  React.useEffect(() => {
    if (draft && screen === null) setScreen(startScreen(draft, isSignedIn));
  }, [draft, screen, isSignedIn]);

  React.useEffect(() => {
    if (screen === 'welcome') analytics.track('onboarding_started');
  }, [screen]);

  const go = (next: OnboardingScreen, back = false) => {
    setIsBack(back);
    setScreen(next);
  };

  const create = React.useCallback(
    async (from: OnboardingDraft) => {
      const request = buildOnboardingRequest(from, ownerName);
      // One business per draft: never twice, never while one is in flight.
      if (!request || inFlight.current || created.current) return;
      inFlight.current = true;
      setError(null);
      setIsBusy(true);
      try {
        const me = await submit.mutateAsync(request);
        created.current = true;
        await clearDraft();
        analytics.track('business_created');
        analytics.group('business', me.business.id);
        onDone?.();
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
    else router.push('/sign-in');
  };

  let body: React.ReactNode = null;
  if (screen === 'welcome') {
    body = (
      <WelcomeScreen
        onStart={() => go('type')}
        onHaveAccount={() => router.push('/sign-in')}
      />
    );
  } else if (screen === 'type') {
    body = (
      <TypeScreen
        selected={draft.typeId}
        onBack={isSignedIn ? undefined : () => go('welcome', true)}
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
          update(goBack);
          go('type', true);
        }}
        onContinue={onContinue}
      />
    );
  }

  return (
    <Ground style={{ flex: 1 }}>
      <Animated.View
        key={screen}
        entering={isBack ? BACKWARD : FORWARD}
        style={{ flex: 1 }}
      >
        {body}
      </Animated.View>
    </Ground>
  );
}
