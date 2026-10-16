import {
  decidePushAction,
  isPushEnabled,
  type PushDecisionInput,
  type PushPermission,
} from '../pushLogic';

const base: PushDecisionInput = {
  permission: 'granted',
  signedIn: true,
  hasBusiness: true,
  canReceivePush: true,
  optedOut: false,
  primerSeen: false,
};

describe('decidePushAction', () => {
  it.each<[string, Partial<PushDecisionInput>, string]>([
    ['granted registers without asking', {}, 'register'],
    [
      'granted registers even after the primer was seen',
      { primerSeen: true },
      'register',
    ],
    [
      'undecided shows the primer once',
      { permission: 'undetermined' },
      'show-primer',
    ],
    [
      'undecided after the primer was answered stays quiet',
      { permission: 'undetermined', primerSeen: true },
      'none',
    ],
    ['denied never asks again', { permission: 'denied' }, 'none'],
    ['signed out does nothing', { signedIn: false }, 'none'],
    ['no business yet does nothing', { hasBusiness: false }, 'none'],
    ['a simulator or web does nothing', { canReceivePush: false }, 'none'],
    [
      'switched off in Settings does not re-register',
      { optedOut: true },
      'none',
    ],
    [
      'switched off in Settings does not show the primer',
      { optedOut: true, permission: 'undetermined' },
      'none',
    ],
  ])('%s', (_label, over, expected) => {
    expect(decidePushAction({ ...base, ...over })).toBe(expected);
  });

  it('covers every permission state when signed in with a business', () => {
    const states: PushPermission[] = ['granted', 'denied', 'undetermined'];
    expect(
      states.map((permission) => decidePushAction({ ...base, permission })),
    ).toEqual(['register', 'none', 'show-primer']);
  });
});

describe('isPushEnabled', () => {
  it.each<[PushPermission, boolean, boolean]>([
    ['granted', false, true],
    ['granted', true, false],
    ['denied', false, false],
    ['undetermined', false, false],
  ])('permission %s, opted out %s -> %s', (permission, optedOut, expected) => {
    expect(isPushEnabled(permission, optedOut)).toBe(expected);
  });
});
