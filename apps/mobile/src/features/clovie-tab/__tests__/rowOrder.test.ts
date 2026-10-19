import { rowOrder, type RowSlot } from '../rowOrder';

const cases: [string, boolean, boolean, RowSlot[]][] = [
  ['unviewed guide with setup', false, true, ['guide', 'setup', 'stories']],
  ['viewed guide with setup', true, true, ['setup', 'stories', 'guide']],
  ['unviewed guide, setup complete', false, false, ['guide', 'stories']],
  ['viewed guide, setup complete', true, false, ['stories', 'guide']],
];

describe('rowOrder', () => {
  it.each(cases)('%s', (_name, isGuideViewed, hasSetup, expected) => {
    expect(rowOrder({ isGuideViewed, hasSetup })).toEqual(expected);
  });

  it('keeps staff (no setup ring) to guide and stories only', () => {
    expect(rowOrder({ isGuideViewed: false, hasSetup: false })).not.toContain(
      'setup',
    );
  });
});
