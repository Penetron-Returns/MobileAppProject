import { Ground } from '@booking/ui';
import * as React from 'react';
import Animated, {
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
} from 'react-native-reanimated';

import { analytics } from '@/features/analytics';

import { useReviseBusiness } from '../hooks';
import {
  backTarget,
  buildReviseRequest,
  hasRevision,
  reviseDraft,
  reviseStartScreen,
  selectType,
  setName,
  type BusinessBasics,
  type OnboardingScreen,
} from '../logic';
import { saveBusinessType } from '../storage';
import { CreateFailedScreen } from './CreateFailedScreen';
import { NameScreen } from './NameScreen';
import { TypeScreen } from './TypeScreen';

const FORWARD = SlideInRight.duration(300).reduceMotion(ReduceMotion.System);
const BACKWARD = SlideInLeft.duration(300).reduceMotion(ReduceMotion.System);

/**
 * Back from the plan screen: the name (prefilled), and the type behind it, for a
 * business that already exists. Continue saves a changed name or type through the
 * onboarding endpoint's revise mode and returns to the plan; nothing is created
 * twice. Back from the type (or Continue with nothing changed) returns to the plan.
 */
export function ReviseBusinessFlow({
  current,
  onDone,
}: {
  current: BusinessBasics;
  /** Back to the plan screen. */
  onDone: () => void;
}) {
  const [draft, setDraft] = React.useState(() => reviseDraft(current));
  const [screen, setScreen] = React.useState<OnboardingScreen>(() =>
    reviseStartScreen(current),
  );
  const [isBack, setIsBack] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const revise = useReviseBusiness();

  const go = (next: OnboardingScreen, back = false) => {
    setIsBack(back);
    setScreen(next);
  };
  const goBack = () => {
    analytics.track('onboarding_back');
    const target = backTarget(screen, { isSignedIn: true, isRevising: true });
    if (target === 'plan' || target === null) onDone();
    else go(target, true);
  };

  const save = async () => {
    const request = buildReviseRequest(draft);
    if (!request || !hasRevision(draft, current)) return onDone();
    setError(null);
    try {
      await revise.mutateAsync(request);
      if (draft.typeId) await saveBusinessType(draft.typeId);
      onDone();
    } catch (e) {
      setError(e);
    }
  };

  if (error) {
    return <CreateFailedScreen error={error} onRetry={() => void save()} />;
  }

  let body: React.ReactNode;
  if (screen === 'type') {
    body = (
      <TypeScreen
        selected={draft.typeId}
        onBack={goBack}
        onSelect={(id) => {
          setDraft((d) => selectType(d, id));
          go('name');
        }}
      />
    );
  } else if (draft.typeId) {
    body = (
      <NameScreen
        typeId={draft.typeId}
        name={draft.businessName}
        isBusy={revise.isPending}
        onChangeName={(name) => setDraft((d) => setName(d, name))}
        onBack={goBack}
        onContinue={() => void save()}
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
