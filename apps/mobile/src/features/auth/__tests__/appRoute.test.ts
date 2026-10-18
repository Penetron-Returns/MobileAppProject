import {
  isBusinessActive,
  provisioningStatus,
  resolveAppRoute,
  type BillingInput,
  type AppRoute,
  type AppRouteInput,
} from '../appRoute';

const paidOwner: BillingInput = {
  plan: 'growth',
  hasCompanion: true,
  role: 'owner',
  provisioning: 'ready',
};

const base: AppRouteInput = {
  authLoaded: true,
  isSignedIn: true,
  sessionStatus: 'active',
  taskKey: null,
  userLoaded: true,
  activeOrgId: 'org_1',
  membershipOrgIds: ['org_1'],
  membershipsStatus: 'idle',
  me: 'ok',
  billing: paidOwner,
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
  [
    'fresh sign-in: no active org, memberships still loading, waits',
    { ...noOrg, membershipsStatus: 'loading' },
    { kind: 'splash' },
  ],
  [
    'fresh sign-in: memberships fetched, activates the first (not onboarding)',
    {
      activeOrgId: null,
      membershipOrgIds: ['org_7'],
      membershipsStatus: 'ready',
      invitations: { status: 'idle', count: 0 },
    },
    { kind: 'activate-org', orgId: 'org_7' },
  ],
  [
    'fresh sign-in: a failed memberships lookup is a session error, not onboarding',
    { ...noOrg, membershipsStatus: 'error' },
    { kind: 'session-error' },
  ],
  [
    'memberships known to be empty with no invitations goes to onboarding',
    {
      ...noOrg,
      membershipsStatus: 'ready',
      invitations: { status: 'ready', count: 0 },
    },
    { kind: 'onboarding' },
  ],
  [
    'memberships known to be empty with an invitation offers to join',
    {
      ...noOrg,
      membershipsStatus: 'ready',
      invitations: { status: 'ready', count: 1 },
    },
    { kind: 'join' },
  ],
  [
    'token unavailable / /me 401 shows the session error, not onboarding',
    { me: 'unauthorized' },
    { kind: 'session-error' },
  ],
  ['active with org and /me ok shows tabs', {}, { kind: 'tabs' }],
  [
    'a new business with plan none: the owner chooses a plan',
    { billing: { ...paidOwner, plan: 'none', hasCompanion: false } },
    { kind: 'choose-plan' },
  ],
  [
    'a legacy free business with no companion also chooses a plan',
    { billing: { ...paidOwner, plan: 'free', hasCompanion: false } },
    { kind: 'choose-plan' },
  ],
  [
    'staff of an inactive business see the inactive screen, not the plans',
    {
      billing: {
        ...paidOwner,
        role: 'staff',
        plan: 'none',
        hasCompanion: false,
      },
    },
    { kind: 'inactive-business' },
  ],
  [
    'a paid owner whose companion account is still being provisioned waits',
    { billing: { ...paidOwner, provisioning: 'pending' } },
    { kind: 'companion-setup' },
  ],
  [
    'staff never wait for provisioning',
    { billing: { ...paidOwner, role: 'staff', provisioning: 'pending' } },
    { kind: 'tabs' },
  ],
  ['billing not loaded yet waits', { billing: null }, { kind: 'splash' }],
  [
    'onboarding still wins while it is mounted, even for an inactive business',
    {
      inOnboarding: true,
      billing: { ...paidOwner, plan: 'none', hasCompanion: false },
    },
    { kind: 'onboarding' },
  ],
];

describe('resolveAppRoute', () => {
  it.each(cases)('%s', (_name, patch, expected) => {
    expect(resolveAppRoute({ ...base, ...patch })).toEqual(expected);
  });
});

describe('isBusinessActive', () => {
  it.each([
    ['none', false, false],
    ['free', false, false],
    ['starter', false, true],
    ['growth', true, true],
    ['free', true, true],
  ] as const)('plan %s, companion %s -> %s', (plan, hasCompanion, expected) => {
    expect(isBusinessActive({ plan, hasCompanion })).toBe(expected);
  });
});

describe('provisioningStatus', () => {
  const ready = { isLoading: false, nextStep: 'connect_whatsapp' } as const;
  it.each([
    [
      'staff never wait',
      {
        isOwner: false,
        isActive: true,
        setup: { isLoading: true, nextStep: null },
      },
      'ready',
    ],
    [
      'an inactive business does not ask',
      {
        isOwner: true,
        isActive: false,
        setup: { isLoading: true, nextStep: null },
      },
      'ready',
    ],
    [
      'loading waits',
      {
        isOwner: true,
        isActive: true,
        setup: { isLoading: true, nextStep: null },
      },
      'pending',
    ],
    [
      'loading does not block a returning owner with a cached /me',
      {
        isOwner: true,
        isActive: true,
        hasCachedMe: true,
        setup: { isLoading: true, nextStep: null },
      },
      'ready',
    ],
    [
      'provision_account still waits for a returning owner',
      {
        isOwner: true,
        isActive: true,
        hasCachedMe: true,
        setup: { isLoading: false, nextStep: 'provision_account' },
      },
      'pending',
    ],
    [
      'provision_account waits',
      {
        isOwner: true,
        isActive: true,
        setup: { isLoading: false, nextStep: 'provision_account' },
      },
      'pending',
    ],
    [
      'connect_whatsapp is ready',
      { isOwner: true, isActive: true, setup: ready },
      'ready',
    ],
    [
      'none is ready',
      {
        isOwner: true,
        isActive: true,
        setup: { isLoading: false, nextStep: 'none' },
      },
      'ready',
    ],
    [
      'a failed lookup never locks the owner out',
      {
        isOwner: true,
        isActive: true,
        setup: { isLoading: false, nextStep: null },
      },
      'ready',
    ],
  ] as const)('%s', (_name, input, expected) => {
    expect(provisioningStatus(input)).toBe(expected);
  });
});

describe('a signed-in user with a business never sees onboarding', () => {
  const route = (extra: Partial<AppRouteInput>) =>
    resolveAppRoute({ ...base, ...extra }).kind;

  it.each([
    ['an owner with a paid plan', {}, 'tabs'],
    [
      'an owner whose org is cached but not yet active',
      { activeOrgId: null, membershipOrgIds: ['org_1'] },
      'activate-org',
    ],
    [
      'an owner with no plan yet (picks one, answers no questions)',
      { billing: { ...paidOwner, plan: 'none', hasCompanion: false } },
      'choose-plan',
    ],
    [
      'staff of a business with no plan',
      {
        billing: {
          ...paidOwner,
          plan: 'none',
          hasCompanion: false,
          role: 'staff',
        },
      },
      'inactive-business',
    ],
    ['an owner while /v1/me loads', { me: 'loading', billing: null }, 'splash'],
  ] as [string, Partial<AppRouteInput>, AppRoute['kind']][])(
    '%s',
    (_label, extra, expected) => {
      expect(route(extra)).toBe(expected);
    },
  );

  it('only a user with no organisation at all is sent to onboarding', () => {
    expect(
      route({
        ...noOrg,
        membershipsStatus: 'ready',
        invitations: { status: 'ready', count: 0 },
      }),
    ).toBe('onboarding');
  });
});
