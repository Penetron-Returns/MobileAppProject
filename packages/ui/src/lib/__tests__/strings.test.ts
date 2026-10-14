import { DS_STRINGS } from '../strings';

describe('design system strings', () => {
  it('has a non-empty English default for every key', () => {
    for (const [key, value] of Object.entries(DS_STRINGS)) {
      expect(value.length).toBeGreaterThan(0);
      expect(key).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
    }
  });

  it('keeps interpolation placeholders in the one string that has them', () => {
    const withPlaceholders = Object.entries(DS_STRINGS).filter(([, v]) =>
      v.includes('{{'),
    );
    expect(withPlaceholders).toEqual([
      ['errors.requestId', 'Reference: {{id}}'],
    ]);
  });
});
