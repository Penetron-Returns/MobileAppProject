import { initials } from '../initials';

describe('initials', () => {
  it.each([
    ['Zanele Mthembu', 'ZM'],
    ['  thandi   mokoena  ', 'TM'],
    ['Cher', 'C'],
    ['Anna Maria van Wyk', 'AW'],
  ])('turns %p into %p', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('falls back for %p', (name) => {
    expect(initials(name)).toBe('?');
    expect(initials(name, '-')).toBe('-');
  });
});
