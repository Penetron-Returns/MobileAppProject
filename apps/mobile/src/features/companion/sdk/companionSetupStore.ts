import type { SetupStep, SetupStepEvent } from '@nerova/react-native';
import * as React from 'react';

/**
 * Where Nerova's first-run setup (hello, connect WhatsApp, review, test
 * message, live) has got to, as reported by the SDK's `onSetupStep`. Held
 * outside React so the Clovie tab and Settings can read it without being
 * inside the SDK provider.
 */
export interface CompanionSetupProgress {
  /** The step the SDK last reported; null until it has reported one. */
  step: SetupStep | null;
  /** Steps the SDK reported as completed. */
  completed: readonly SetupStep[];
}

const EMPTY: CompanionSetupProgress = { step: null, completed: [] };
let progress = EMPTY;
const listeners = new Set<() => void>();

export function reportSetupStep(event: SetupStepEvent): void {
  progress = {
    step: event.step,
    completed:
      event.completed && !progress.completed.includes(event.step)
        ? [...progress.completed, event.step]
        : progress.completed,
  };
  listeners.forEach((l) => l());
}

/** For tests and sign-out: forget everything. */
export function resetSetupProgress(): void {
  progress = EMPTY;
  listeners.forEach((l) => l());
}

export function useSetupProgress(): CompanionSetupProgress {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => progress,
    () => EMPTY,
  );
}
