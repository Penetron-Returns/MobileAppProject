import * as React from 'react';

import { initialDraft, type OnboardingDraft } from './logic';
import { loadDraft, saveDraft } from './storage';

/**
 * The saved onboarding draft: null until it has been read back from secure
 * storage, then the live draft. `update` applies a pure step from `logic.ts`
 * and saves the result, so a killed app resumes where the owner was.
 */
export function useOnboardingDraft() {
  const [draft, setDraft] = React.useState<OnboardingDraft | null>(null);
  const latest = React.useRef<OnboardingDraft | null>(null);

  React.useEffect(() => {
    let alive = true;
    void loadDraft().then((stored) => {
      if (!alive) return;
      latest.current = stored;
      setDraft(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = React.useCallback(
    (step: (current: OnboardingDraft) => OnboardingDraft) => {
      const next = step(latest.current ?? initialDraft());
      latest.current = next;
      setDraft(next);
      void saveDraft(next);
    },
    [],
  );

  return { draft, update };
}
