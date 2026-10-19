import { reportSource, sourceRows } from '../sources';

describe('reportSource', () => {
  it.each([
    // Every value of the appointment_source enum, plus a future one.
    ['whatsapp', 'whatsapp'],
    ['app', 'clovie'],
    ['legacy', 'clovie'],
    // Legacy: the web comparator page is retired, so old rows count as Clovie.
    ['web', 'clovie'],
    ['something_new', 'clovie'],
  ])('maps %s to %s', (source, expected) => {
    expect(reportSource(source)).toBe(expected);
  });
});

describe('sourceRows', () => {
  it.each([
    [
      { whatsapp: 3, clovie: 1 },
      [
        ['whatsapp', 75],
        ['clovie', 25],
      ],
    ],
    [
      { whatsapp: 1, clovie: 3 },
      [
        ['clovie', 75],
        ['whatsapp', 25],
      ],
    ],
    [
      { whatsapp: 1, clovie: 2 },
      [
        ['clovie', 67],
        ['whatsapp', 33],
      ],
    ],
    [
      { whatsapp: 101, clovie: 99 },
      [
        ['whatsapp', 50],
        ['clovie', 50],
      ],
    ],
    [
      { whatsapp: 4, clovie: 0 },
      [
        ['whatsapp', 100],
        ['clovie', 0],
      ],
    ],
    [{ whatsapp: 0, clovie: 0 }, []],
  ])('splits %j', (counts, expected) => {
    expect(sourceRows(counts).map((r) => [r.key, r.percent])).toEqual(expected);
  });
});
