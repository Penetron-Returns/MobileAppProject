import {
  buildOnboardingRequest,
  canGoBack,
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

  it('shows Back only on the name question, and Back keeps what was typed', () => {
    const draft = named('salon', 'Ashgrove');
    expect(canGoBack(initialDraft())).toBe(false);
    expect(canGoBack(draft)).toBe(true);
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
