import * as React from 'react';

import type { AppRoute } from '@/features/auth/appRoute';

type Kind = AppRoute['kind'];

/** True when the route just left the plan screen for the app: the plan was bought. */
export function isUnlockTransition(from: Kind, to: Kind): boolean {
  return from === 'choose-plan' && (to === 'companion-setup' || to === 'tabs');
}

/**
 * "You're all set" shows once, the moment the plan screen gives way to the app.
 * Derived from the route change (no fetch, no flag to persist), so it can never
 * reappear on a later launch.
 */
export function useUnlockMoment(kind: Kind): {
  isShown: boolean;
  dismiss: () => void;
} {
  const [state, setState] = React.useState({
    previous: kind,
    isShown: false,
  });
  let current = state;
  if (state.previous !== kind) {
    current = {
      previous: kind,
      isShown: state.isShown || isUnlockTransition(state.previous, kind),
    };
    setState(current);
  }
  const dismiss = React.useCallback(
    () => setState((s) => ({ ...s, isShown: false })),
    [],
  );
  return { isShown: current.isShown, dismiss };
}
