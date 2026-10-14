import {
  resolveAppRoute,
  type AppRoute,
  type AppRouteInput,
} from '../appRoute';

const base: AppRouteInput = {
  authLoaded: true,
  isSignedIn: true,
  sessionStatus: 'active',
  taskKey: null,
  userLoaded: true,
  activeOrgId: 'org_1',
  membershipOrgIds: ['org_1'],
  me: 'ok',
  invitations: { status: 'idle', count: 0 },
  joinDeclined: false,
  inOnboarding: false,
};

const noOrg = { activeOrgId: null, membershipOrgIds: [] } as const;

const cases: [string, Partial<AppRouteInput>, AppRoute][] = [
  [
    'auth not loaded',
    { authLoaded: false, isSignedIn: false },
    { kind: 'splash' },
  ],
  [
    'signed out',
    { isSignedIn: false, sessionStatus: null },
    { kind: 'signed-out' },
  ],
  ['user not loaded yet', { userLoaded: false }, { kind: 'splash' }],
  [
    'pending session with a membership activates the first org',
    {
      sessionStatus: 'pending',
      taskKey: 'choose-organization',
      activeOrgId: null,
      membershipOrgIds: ['org_9', 'org_2'],
    },
    { kind: 'activate-org', orgId: 'org_9' },
  ],
  [
    'pending session without memberships goes to onboarding',
    {
      sessionStatus: 'pending',
      taskKey: 'choose-organization',
      activeOrgId: null,
      membershipOrgIds: [],
    },
    { kind: 'onboarding' },
  ],
  [
    'active session without org or memberships goes to onboarding',
    { activeOrgId: null, membershipOrgIds: [] },
    { kind: 'onboarding' },
  ],
  [
    'active session with memberships but no active org activates',
    { activeOrgId: null, membershipOrgIds: ['org_3'] },
    { kind: 'activate-org', orgId: 'org_3' },
  ],
  [
    'MFA setup task is reported, not spun on',
    { sessionStatus: 'pending', taskKey: 'setup-mfa', activeOrgId: null },
    { kind: 'unsupported-task', task: 'setup-mfa' },
  ],
  [
    'password reset task is reported',
    { sessionStatus: 'pending', taskKey: 'reset-password' },
    { kind: 'unsupported-task', task: 'reset-password' },
  ],
  ['org active, /me loading', { me: 'loading' }, { kind: 'splash' }],
  ['org active, /me idle', { me: 'idle' }, { kind: 'splash' }],
  [
    'org active, no business row',
    { me: 'no_business' },
    { kind: 'onboarding' },
  ],
  [
    'onboarding stays mounted after the business exists',
    { inOnboarding: true, me: 'ok' },
    { kind: 'onboarding' },
  ],
  [
    '/me error shows the session error screen',
    { me: 'error' },
    { kind: 'session-error' },
  ],
  [
    'no organisation while invitations load waits',
    { ...noOrg, invitations: { status: 'loading', count: 0 } },
    { kind: 'splash' },
  ],
  [
    'no organisation with a pending invitation offers to join',
    { ...noOrg, invitations: { status: 'ready', count: 1 } },
    { kind: 'join' },
  ],
  [
    'a pending session with an invitation offers to join',
    {
      ...noOrg,
      sessionStatus: 'pending',
      taskKey: 'choose-organization',
      invitations: { status: 'ready', count: 2 },
    },
    { kind: 'join' },
  ],
  [
    'declining the invitation goes to onboarding',
    {
      ...noOrg,
      invitations: { status: 'ready', count: 1 },
      joinDeclined: true,
    },
    { kind: 'onboarding' },
  ],
  [
    'no invitations goes to onboarding',
    { ...noOrg, invitations: { status: 'ready', count: 0 } },
    { kind: 'onboarding' },
  ],
  [
    'a failed invitation lookup falls through to onboarding',
    { ...noOrg, invitations: { status: 'error', count: 0 } },
    { kind: 'onboarding' },
  ],
  [
    'a membership wins over an invitation (activate, do not join)',
    {
      activeOrgId: null,
      membershipOrgIds: ['org_5'],
      invitations: { status: 'ready', count: 1 },
    },
    { kind: 'activate-org', orgId: 'org_5' },
  ],
  [
    'an active organisation ignores invitations',
    { invitations: { status: 'ready', count: 3 } },
    { kind: 'tabs' },
  ],
  ['active with org and /me ok shows tabs', {}, { kind: 'tabs' }],
];

describe('resolveAppRoute', () => {
  it.each(cases)('%s', (_name, patch, expected) => {
    expect(resolveAppRoute({ ...base, ...patch })).toEqual(expected);
  });
});
