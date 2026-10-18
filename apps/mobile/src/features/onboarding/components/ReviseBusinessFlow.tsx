import * as React from 'react';
import { useSharedValue } from 'react-native-reanimated';

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
import { OnboardingChrome } from './OnboardingShell';
import { StepHost } from './StepHost';
import { TypeScreen } from './TypeScreen';

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
  // 1 going on, -1 going back: read on the UI thread by the step transition.
  const direction = useSharedValue(1);
  const [error, setError] = React.useState<unknown>(null);
  const revise = useReviseBusiness();

  const go = (next: OnboardingScreen, back = false) => {
    direction.value = back ? -1 : 1;
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
    return (
      <CreateFailedScreen
        mode="revise"
        error={error}
        onRetry={() => void save()}
        onBack={onDone}
      />
    );
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
    <OnboardingChrome reserveDots>
      <StepHost stepKey={screen} direction={direction}>
        {body}
      </StepHost>
    </OnboardingChrome>
  );
}
