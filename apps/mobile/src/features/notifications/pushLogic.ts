/** Pure rules for registering this phone for push, kept free of Expo so they are table-testable. */

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export type PushAction =
  /** Get the Expo push token and send it to the API (no prompt) */
  | 'register'
  /** Show the one-time primer, then the system prompt if the owner agrees */
  | 'show-primer'
  | 'none';

export interface PushDecisionInput {
  permission: PushPermission;
  signedIn: boolean;
  /** An active business exists: tokens are stored per business */
  hasBusiness: boolean;
  /** Simulators and web cannot receive push */
  canReceivePush: boolean;
  /** The owner switched push off in Settings; never re-enable behind their back */
  optedOut: boolean;
  /** The primer was already answered ("Not now" included): it is shown once */
  primerSeen: boolean;
}

export function decidePushAction(input: PushDecisionInput): PushAction {
  if (!input.signedIn || !input.hasBusiness || !input.canReceivePush)
    return 'none';
  if (input.optedOut) return 'none';
  if (input.permission === 'granted') return 'register';
  if (input.permission === 'undetermined' && !input.primerSeen)
    return 'show-primer';
  return 'none';
}

/** What the Settings switch shows: real permission AND not switched off by the owner. */
export function isPushEnabled(
  permission: PushPermission,
  optedOut: boolean,
): boolean {
  return permission === 'granted' && !optedOut;
}
