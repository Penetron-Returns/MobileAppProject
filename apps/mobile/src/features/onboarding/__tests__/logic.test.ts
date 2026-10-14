import {
  addTeamMember,
  buildOnboardingRequest,
  canAddTeamMember,
  canContinue,
  canGoBack,
  canSkip,
  hoursFor,
  initialDraft,
  nextStep,
  prevStep,
  progressFraction,
  removeTeamMember,
  sanitizePrice,
  selectType,
  servicesFor,
  setPrice,
  summaryText,
  toggleDay,
  toggleService,
  type OnboardingDraft,
} from '../logic';

const named = (name = 'Ashgrove'): OnboardingDraft => ({
  ...initialDraft(),
  businessName: name,
});

describe('onboarding hours', () => {
  it('fills hours by business type with Sunday closed by default', () => {
    const rows = hoursFor(selectType(initialDraft(), 'barber'));
    expect(rows.map((r) => r.value)).toEqual([
      '08:00 to 18:00',
      '08:00 to 15:00',
      'Closed',
    ]);
  });

  it('toggles a day and keeps the choice when the type changes', () => {
    let d = toggleDay(initialDraft(), 'sunday');
    expect(hoursFor(d)[2]).toMatchObject({
      isOpen: true,
      value: '09:00 to 13:00',
    });
    d = toggleDay(d, 'saturday');
    d = selectType(d, 'beauty');
    expect(hoursFor(d).map((r) => r.isOpen)).toEqual([true, false, true]);
    expect(hoursFor(d)[0].value).toBe('09:00 to 17:00');
  });
});

describe('onboarding services', () => {
  it('uses template prices and lets owners edit or switch off services', () => {
    let d = selectType(initialDraft(), 'barber');
    expect(servicesFor(d)[0]).toMatchObject({
      name: 'Skin fade',
      priceText: '180',
      detail: '30 min',
      isOn: true,
    });
    d = setPrice(d, 'Skin fade', 'R 2a5!0');
    d = toggleService(d, 'Kids cut');
    expect(servicesFor(d)[0].priceText).toBe('250');
    expect(servicesFor(d)[3].isOn).toBe(false);
    d = toggleService(d, 'Kids cut');
    expect(servicesFor(d)[3].isOn).toBe(true);
  });

  it.each([
    ['', ''],
    ['abc', ''],
    ['1 250', '1250'],
    ['12345678', '123456'],
  ])('sanitises price %j to %j', (input, out) => {
    expect(sanitizePrice(input)).toBe(out);
  });
});

describe('onboarding team', () => {
  it('adds trimmed members and rejects blanks, duplicates and overflow', () => {
    let d = addTeamMember(named(), '  Naledi ', ' Stylist ');
    expect(d.team).toEqual([{ name: 'Naledi', title: 'Stylist' }]);
    expect(addTeamMember(d, 'naledi').team).toHaveLength(1);
    expect(addTeamMember(d, '   ').team).toHaveLength(1);
    expect(
      canAddTeamMember(
        Array.from({ length: 20 }, (_, i) => ({ name: `m${i}`, title: '' })),
        'new',
      ),
    ).toBe(false);
    d = removeTeamMember(d, 0);
    expect(d.team).toEqual([]);
  });
});

describe('onboarding navigation', () => {
  it('clamps steps, hides back on the first and last step, and allows skipping only the team step', () => {
    expect(prevStep(1)).toBe(1);
    expect(nextStep(5)).toBe(5);
    expect(nextStep(2)).toBe(3);
    expect([1, 2, 3, 4, 5].map((s) => canGoBack(s as 1))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect([1, 2, 3, 4, 5].map((s) => canSkip(s as 1))).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(progressFraction(2)).toBeCloseTo(0.4);
  });

  it('needs a business name and an open day to continue from the hours step', () => {
    expect(canContinue(2, initialDraft())).toBe(false);
    expect(canContinue(2, named('  '))).toBe(false);
    expect(canContinue(2, named())).toBe(true);
    let d = named();
    for (const id of ['weekdays', 'saturday'] as const) d = toggleDay(d, id);
    expect(canContinue(2, d)).toBe(false);
    expect(canContinue(1, initialDraft())).toBe(true);
  });
});

describe('buildOnboardingRequest', () => {
  it('maps day groups to weekdays, rand to cents and skips switched-off services', () => {
    let d = selectType(named('  Ashgrove Hair  '), 'barber');
    d = toggleService(d, 'Kids cut');
    d = setPrice(d, 'Beard trim', '');
    d = addTeamMember(d, 'Naledi');
    const req = buildOnboardingRequest(d, ' Kobus ');
    expect(req.business.name).toBe('Ashgrove Hair');
    expect(req.owner_name).toBe('Kobus');
    expect(req.hours.map((h) => h.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(req.hours[0]).toEqual({
      weekday: 1,
      opens_at: '08:00',
      closes_at: '18:00',
    });
    expect(req.services.map((s) => s.name)).toEqual([
      'Skin fade',
      'Fade & beard',
      'Beard trim',
    ]);
    expect(req.services[0]).toEqual({
      name: 'Skin fade',
      duration_minutes: 30,
      price_cents: 18_000,
    });
    expect(req.services[2].price_cents).toBe(0);
    expect(req.team).toEqual([{ name: 'Naledi', title: null }]);
  });

  it('sends no owner name when none is known', () => {
    expect(buildOnboardingRequest(named(), null).owner_name).toBeNull();
  });
});

describe('summaryText', () => {
  it('names the business type and counts services with correct plurals', () => {
    expect(summaryText(selectType(named(), 'barber'))).toContain(
      'Your barber shop is set up with 4 services.',
    );
    let d = named();
    for (const s of servicesFor(d).slice(1)) d = toggleService(d, s.name);
    expect(summaryText(d)).toContain('with 1 service.');
  });
});
