import { needsName, validateName } from '../name';

describe('needsName', () => {
  it.each([
    [undefined, true],
    [null, true],
    ['', true],
    ['   ', true],
    ['Sam', false],
  ])('for first name %j returns %s', (firstName, expected) => {
    expect(needsName(firstName)).toBe(expected);
  });
});

describe('validateName', () => {
  it.each([
    [{ firstName: '', lastName: '' }],
    [{ firstName: '   ', lastName: 'Jones' }],
  ])('requires a first name: %j', (input) => {
    expect(validateName(input)).toEqual({
      ok: false,
      error: 'firstNameRequired',
    });
  });

  it('trims both names and collapses inner spaces', () => {
    expect(
      validateName({ firstName: '  Sam  ', lastName: ' van   Dyk ' }),
    ).toEqual({ ok: true, name: { firstName: 'Sam', lastName: 'van Dyk' } });
  });

  it('allows a missing last name', () => {
    expect(validateName({ firstName: 'Cher', lastName: ' ' })).toEqual({
      ok: true,
      name: { firstName: 'Cher', lastName: '' },
    });
  });
});
