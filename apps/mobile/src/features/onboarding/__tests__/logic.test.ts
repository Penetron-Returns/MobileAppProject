import {
  backTarget,
  buildOnboardingRequest,
  buildReviseRequest,
  hasRevision,
  reviseDraft,
  reviseStartScreen,
  confirmName,
  dotStates,
  shouldAutoSubmit,
  startScreen,
  canSubmit,
  goBack,
  initialDraft,
  parseDraft,
  selectType,
  serializeDraft,
  setName,
  type BusinessTypeId,
} from '../logic';

const named = (typeId: BusinessTypeId, name: string) =>
  setName(selectType(initialDraft(), typeId), name);

describe('two-question flow', () => {
  it('starts on the type question with nothing chosen', () => {
    expect(initialDraft()).toEqual({ step: 1, typeId: null, businessName: '' });
  });

  it('one tap on a type picks it and moves to the name', () => {
    expect(selectType(initialDraft(), 'barber')).toEqual({
      step: 2,
      typeId: 'barber',
      businessName: '',
    });
  });

  it('Back returns to the type and keeps what was typed', () => {
    const draft = named('salon', 'Ashgrove');
    expect(goBack(draft)).toMatchObject({ step: 1, businessName: 'Ashgrove' });
    expect(goBack(initialDraft()).step).toBe(1);
  });

  it.each([
    ['a type and a name', named('salon', 'Ashgrove'), true],
    ['a blank name', named('salon', '   '), false],
    ['no type', setName(initialDraft(), 'Ashgrove'), false],
  ])('can submit with %s: %s', (_label, draft, expected) => {
    expect(canSubmit(draft)).toBe(expected);
  });

  it('caps the name length', () => {
    expect(setName(initialDraft(), 'x'.repeat(500)).businessName).toHaveLength(
      120,
    );
  });
});

describe('buildOnboardingRequest', () => {
  it('is null until it can be submitted', () => {
    expect(buildOnboardingRequest(initialDraft(), null)).toBeNull();
    expect(buildOnboardingRequest(named('salon', ' '), null)).toBeNull();
  });

  it('sends the trimmed name, the owner and no other staff', () => {
    const req = buildOnboardingRequest(named('salon', '  Ashgrove '), ' Zoe ');
    expect(req?.business).toEqual({ name: 'Ashgrove' });
    expect(req?.owner_name).toBe('Zoe');
    expect(req?.team).toEqual([]);
    expect(
      buildOnboardingRequest(named('salon', 'A'), '  ')?.owner_name,
    ).toBeNull();
  });

  it('uses the type hours: Monday to Saturday open, Sunday closed', () => {
    const hours = buildOnboardingRequest(named('barber', 'B'), null)?.hours;
    expect(hours?.map((h) => h.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hours?.[0]).toEqual({
      weekday: 1,
      opens_at: '08:00',
      closes_at: '18:00',
    });
    expect(hours?.[5]).toEqual({
      weekday: 6,
      opens_at: '08:00',
      closes_at: '15:00',
    });
  });

  it('uses the type services at template prices in cents', () => {
    const services = buildOnboardingRequest(
      named('barber', 'B'),
      null,
    )?.services;
    expect(services).toHaveLength(4);
    expect(services?.[0]).toEqual({
      name: 'Skin fade',
      duration_minutes: 30,
      price_cents: 18_000,
    });
  });

  it.each(['barber', 'salon', 'beauty', 'mix'] as const)(
    'has hours and services for %s',
    (id) => {
      const req = buildOnboardingRequest(named(id, 'X'), null);
      expect(req?.hours.length).toBeGreaterThan(0);
      expect(req?.services.length).toBeGreaterThan(0);
    },
  );
});

describe('draft persistence', () => {
  it('round-trips the step, type and name', () => {
    const draft = named('beauty', 'Glow');
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
  });

  it.each([
    ['nothing stored', null],
    ['not JSON', '{oops'],
    ['not an object', '42'],
    ['null', 'null'],
  ])('starts over for %s', (_label, raw) => {
    expect(parseDraft(raw)).toEqual(initialDraft());
  });

  it('drops an unknown type and never lands on the name question without one', () => {
    expect(
      parseDraft(
        JSON.stringify({ step: 2, typeId: 'florist', businessName: 'x' }),
      ),
    ).toEqual({ step: 1, typeId: null, businessName: 'x' });
  });
});

describe('progress dots', () => {
  it.each([
    [1, ['active', 'todo', 'todo']],
    [2, ['done', 'active', 'todo']],
    [3, ['done', 'done', 'active']],
  ] as const)('stage %s', (stage, expected) => {
    expect(dotStates(stage)).toEqual(expected);
  });
});

describe('confirming the name', () => {
  it('moves a complete draft to step 3', () => {
    expect(confirmName(named('salon', 'Ashgrove')).step).toBe(3);
  });

  it('does nothing for a blank name', () => {
    expect(confirmName(named('salon', ' ')).step).toBe(2);
  });

  it('survives a stored round trip, and is not trusted without a name or type', () => {
    const confirmed = confirmName(named('salon', 'Ashgrove'));
    expect(parseDraft(serializeDraft(confirmed))).toEqual(confirmed);
    expect(
      parseDraft(
        JSON.stringify({ step: 3, typeId: 'salon', businessName: ' ' }),
      ).step,
    ).toBe(2);
    expect(
      parseDraft(JSON.stringify({ step: 3, typeId: null, businessName: 'A' }))
        .step,
    ).toBe(1);
  });
});

describe('where onboarding opens', () => {
  const half = selectType(initialDraft(), 'barber');
  it.each([
    ['signed out, first launch', initialDraft(), false, 'welcome'],
    ['signed in, no draft', initialDraft(), true, 'type'],
    ['signed out, resumed on the name', half, false, 'name'],
    ['signed out, resumed on the type', goBack(half), false, 'type'],
    [
      'signed out, name confirmed',
      confirmName(named('salon', 'A')),
      false,
      'name',
    ],
    ['signed in, resumed on the name', half, true, 'name'],
  ] as const)('%s opens on %s', (_label, draft, signedIn, expected) => {
    expect(startScreen(draft, signedIn)).toBe(expected);
  });
});

describe('auto-submit after sign-in', () => {
  const confirmed = confirmName(named('salon', 'A'));
  it('creates the business once signed in with a confirmed draft', () => {
    expect(shouldAutoSubmit(confirmed, true)).toBe(true);
  });
  it.each([
    ['signed out', confirmed, false],
    ['an unconfirmed draft', named('salon', 'A'), true],
    ['no draft', initialDraft(), true],
  ])('does not with %s', (_label, draft, signedIn) => {
    expect(shouldAutoSubmit(draft, signedIn)).toBe(false);
  });
});

describe('Back from every first-run screen', () => {
  it.each([
    ['welcome, signed out', 'welcome', false, false, null],
    ['type, signed out', 'type', false, false, 'welcome'],
    ['type, signed in (nothing before it)', 'type', true, false, null],
    ['type, revising a created business', 'type', true, true, 'plan'],
    ['name, signed out', 'name', false, false, 'type'],
    ['name, signed in', 'name', true, false, 'type'],
    ['name, revising a created business', 'name', true, true, 'type'],
  ] as const)('%s', (_label, screen, isSignedIn, isRevising, expected) => {
    expect(backTarget(screen, { isSignedIn, isRevising })).toBe(expected);
  });
});

describe('revising a created business', () => {
  const current = { name: 'Ashgrove', typeId: 'salon' } as const;

  it('prefills the name and type and opens on the name', () => {
    expect(reviseDraft(current)).toEqual({
      step: 2,
      typeId: 'salon',
      businessName: 'Ashgrove',
    });
    expect(reviseStartScreen(current)).toBe('name');
  });

  it('opens on the type when the type was not remembered', () => {
    expect(reviseStartScreen({ name: 'Ashgrove', typeId: null })).toBe('type');
  });

  it.each([
    ['nothing changed', 'Ashgrove', 'salon', false],
    ['only surrounding spaces', '  Ashgrove ', 'salon', false],
    ['name changed', 'Ashgrove Hair', 'salon', true],
    ['type changed', 'Ashgrove', 'barber', true],
    ['both changed', 'Cuts', 'barber', true],
  ] as const)('%s', (_label, name, typeId, expected) => {
    const draft = { step: 2 as const, typeId, businessName: name };
    expect(hasRevision(draft, current)).toBe(expected);
  });

  it('builds a revise request with the new type template and no team', () => {
    const request = buildReviseRequest({
      step: 2,
      typeId: 'barber',
      businessName: ' Cuts ',
    });
    expect(request).toMatchObject({
      revise: true,
      business: { name: 'Cuts' },
      team: [],
    });
    expect(request?.services[0]?.name).toBe('Skin fade');
    expect(
      buildReviseRequest({ step: 2, typeId: null, businessName: 'x' }),
    ).toBeNull();
  });
});
