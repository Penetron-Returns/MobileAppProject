import {
  deriveChecklist,
  parseReviewed,
  serializeReviewed,
  type ChecklistInput,
  type ChecklistItemId,
} from '../logic';

const fresh: ChecklistInput = {
  platform: 'android',
  servicesCount: 4,
  hoursCount: 6,
  staffCount: 1,
  hasContactDetails: false,
  isVoiceOn: false,
  isPushGranted: false,
  reviewed: new Set(),
};

const done = (input: ChecklistInput) =>
  Object.fromEntries(
    deriveChecklist(input).items.map((i) => [i.id, i.isDone]),
  ) as Record<ChecklistItemId, boolean | undefined>;

describe('deriveChecklist', () => {
  it('lists the seven items in order on Android, with no test message', () => {
    expect(deriveChecklist(fresh).items.map((i) => i.id)).toEqual([
      'services',
      'hours',
      'team',
      'details',
      'rules',
      'voice',
      'notifications',
    ]);
  });

  it('leaves Hey Clovie off the list off Android', () => {
    const ids = deriveChecklist({ ...fresh, platform: 'ios' }).items.map(
      (i) => i.id,
    );
    expect(ids).not.toContain('voice');
    expect(ids).toHaveLength(6);
  });

  it('starts with nothing done right after onboarding (the template alone is not a review)', () => {
    const result = deriveChecklist(fresh);
    expect(result.doneCount).toBe(0);
    expect(result.isComplete).toBe(false);
  });

  it('counts services and hours only once they exist and were looked at', () => {
    const reviewed = new Set<ChecklistItemId>(['services', 'hours']);
    expect(done({ ...fresh, reviewed })).toMatchObject({
      services: true,
      hours: true,
    });
    expect(
      done({ ...fresh, reviewed, servicesCount: 0, hoursCount: 0 }),
    ).toMatchObject({ services: false, hours: false });
  });

  it('is done by data: a second team member, contact details, push granted, hands-free on', () => {
    expect(
      done({
        ...fresh,
        staffCount: 2,
        hasContactDetails: true,
        isPushGranted: true,
        isVoiceOn: true,
      }),
    ).toMatchObject({
      team: true,
      details: true,
      notifications: true,
      voice: true,
      rules: false,
    });
  });

  it('is done by looking, for the choices an owner may leave as they are', () => {
    const reviewed = new Set<ChecklistItemId>([
      'team',
      'details',
      'rules',
      'voice',
      'notifications',
    ]);
    expect(done({ ...fresh, reviewed })).toMatchObject({
      team: true,
      details: true,
      rules: true,
      voice: true,
      notifications: true,
    });
  });

  it('is complete (and hides) only when every item is done', () => {
    const all: ChecklistInput = {
      ...fresh,
      staffCount: 3,
      hasContactDetails: true,
      isVoiceOn: true,
      isPushGranted: true,
      reviewed: new Set(['services', 'hours', 'rules']),
    };
    expect(deriveChecklist(all)).toMatchObject({
      isComplete: true,
      isReady: true,
      doneCount: 7,
    });
    expect(deriveChecklist({ ...all, platform: 'ios' }).doneCount).toBe(6);
    expect(
      deriveChecklist({ ...all, reviewed: new Set(['services', 'hours']) })
        .isComplete,
    ).toBe(false);
  });

  it.each([
    ['services', { servicesCount: null }],
    ['hours', { hoursCount: null }],
    ['team', { staffCount: null }],
    ['details', { hasContactDetails: null }],
    ['notifications', { isPushGranted: null }],
  ] as const)('is not ready while %s is loading', (_name, patch) => {
    const result = deriveChecklist({ ...fresh, ...patch });
    expect(result.isReady).toBe(false);
    expect(result.isComplete).toBe(false);
  });
});

describe('reviewed persistence', () => {
  it('round-trips', () => {
    const set = new Set<ChecklistItemId>(['rules', 'team']);
    expect(parseReviewed(serializeReviewed(set))).toEqual(set);
  });

  it.each([null, '{oops', '"x"', '{"a":1}'])('reads %s as nothing', (raw) => {
    expect(parseReviewed(raw).size).toBe(0);
  });

  it('drops ids it does not know', () => {
    expect(parseReviewed('["rules","florist"]')).toEqual(new Set(['rules']));
  });
});
