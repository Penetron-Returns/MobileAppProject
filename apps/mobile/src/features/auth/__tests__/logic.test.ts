import {
  codeCells,
  isCodeComplete,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  parseIdentifier,
  resendSecondsLeft,
  sanitizeCode,
} from '../logic';

describe('isValidEmail', () => {
  it.each([
    ['colin@nerovasystems.com', true],
    ['  Colin+bk1@NerovaSystems.com ', true],
    ['', false],
    ['colin', false],
    ['colin@', false],
    ['colin@nerova', false],
    ['a b@c.com', false],
  ])('%j -> %s', (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});

it('normalizes email to trimmed lowercase', () => {
  expect(normalizeEmail('  Colin+BK1@Nerova.com ')).toBe(
    'colin+bk1@nerova.com',
  );
});

describe('sanitizeCode', () => {
  it.each([
    ['123456', '123456'],
    ['12 34-56', '123456'],
    ['1234567890', '123456'],
    ['abc', ''],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeCode(input)).toBe(expected);
  });
});

it('knows when a code is complete', () => {
  expect(isCodeComplete('12345')).toBe(false);
  expect(isCodeComplete('123456')).toBe(true);
});

it('pads code cells to six entries', () => {
  expect(codeCells('12')).toEqual(['1', '2', '', '', '', '']);
  expect(codeCells('')).toEqual(['', '', '', '', '', '']);
});

describe('resendSecondsLeft', () => {
  it('is 0 when there is no cooldown', () => {
    expect(resendSecondsLeft(null, 1_000)).toBe(0);
  });
  it('rounds partial seconds up', () => {
    expect(resendSecondsLeft(30_001, 1_000)).toBe(30);
    expect(resendSecondsLeft(1_500, 1_000)).toBe(1);
  });
  it('never goes negative', () => {
    expect(resendSecondsLeft(500, 2_000)).toBe(0);
  });
});

describe('parseIdentifier', () => {
  it.each([
    [
      ' Colin@Nerova.com ',
      { strategy: 'email_code', value: 'colin@nerova.com' },
    ],
    ['+27 82 555 0100', { strategy: 'phone_code', value: '+27825550100' }],
    ['+27 (82) 555-0100', { strategy: 'phone_code', value: '+27825550100' }],
    ['0027825550100', { strategy: 'phone_code', value: '+27825550100' }],
    ['0825550100', null],
    ['+0825550100', null],
    ['+27 82', null],
    ['+2782555010012345', null],
    ['nope', null],
    ['', null],
  ])('%j', (input, expected) => {
    expect(parseIdentifier(input)).toEqual(expected);
  });

  it('normalizes phone numbers typed with separators', () => {
    expect(normalizePhone(' +1 (415) 555.2671 ')).toBe('+14155552671');
  });
});
