import {
  bucketKey,
  bucketLabel,
  bucketTitle,
  periodLabelParts,
  periodQueryBounds,
  previousLabelParts,
  reportPeriod,
  type ReportRange,
} from '../period';

describe('reportPeriod', () => {
  it.each<[string, ReportRange, string, string, string, string, number]>([
    // name, range, today, from, prevFrom, prevTo, bucket count
    [
      'week on a Wednesday',
      'week',
      '2026-10-14',
      '2026-10-12',
      '2026-10-05',
      '2026-10-08',
      7,
    ],
    [
      'week on a Monday',
      'week',
      '2026-10-12',
      '2026-10-12',
      '2026-10-05',
      '2026-10-06',
      7,
    ],
    [
      'week on a Sunday',
      'week',
      '2026-10-18',
      '2026-10-12',
      '2026-10-05',
      '2026-10-12',
      7,
    ],
    [
      'week across a month end',
      'week',
      '2026-11-01',
      '2026-10-26',
      '2026-10-19',
      '2026-10-26',
      7,
    ],
    [
      'month mid way',
      'month',
      '2026-10-14',
      '2026-10-01',
      '2026-09-01',
      '2026-09-15',
      14,
    ],
    [
      'month after a shorter month',
      'month',
      '2026-03-31',
      '2026-03-01',
      '2026-02-01',
      '2026-03-01',
      31,
    ],
    [
      'month in January',
      'month',
      '2026-01-10',
      '2026-01-01',
      '2025-12-01',
      '2025-12-11',
      10,
    ],
    [
      'year in October',
      'year',
      '2026-10-14',
      '2026-01-01',
      '2025-01-01',
      '2025-10-15',
      10,
    ],
    [
      'year on 1 January',
      'year',
      '2026-01-01',
      '2026-01-01',
      '2025-01-01',
      '2025-01-02',
      1,
    ],
  ])('%s', (_name, range, today, from, prevFrom, prevTo, buckets) => {
    const period = reportPeriod(range, today);
    expect(period.from).toBe(from);
    expect(period.prevFrom).toBe(prevFrom);
    expect(period.prevTo).toBe(prevTo);
    expect(period.buckets).toHaveLength(buckets);
  });

  it('never counts days after today', () => {
    const period = reportPeriod('month', '2026-10-14');
    expect(period.to).toBe('2026-10-15');
    expect(period.buckets.at(-1)).toBe('2026-10-14');
  });

  it('draws the whole week but only the months so far for a year', () => {
    expect(reportPeriod('week', '2026-10-14').buckets.at(-1)).toBe(
      '2026-10-18',
    );
    expect(reportPeriod('year', '2026-03-05').buckets).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
  });
});

describe('bucketKey', () => {
  it('keeps days and snaps to the first of the month for year bars', () => {
    expect(bucketKey('2026-10-14', 'day')).toBe('2026-10-14');
    expect(bucketKey('2026-10-14', 'month')).toBe('2026-10-01');
  });
});

describe('periodQueryBounds', () => {
  it('spans the previous period start to the end of today, in business time', () => {
    expect(
      periodQueryBounds(
        reportPeriod('month', '2026-10-14'),
        'Africa/Johannesburg',
      ),
    ).toEqual({
      from: '2026-08-31T22:00:00.000Z',
      to: '2026-10-14T22:00:00.000Z',
    });
  });

  it('follows the clock change in a DST zone', () => {
    // London: 16 March is GMT, the end of 29 March is already BST (+1).
    expect(
      periodQueryBounds(reportPeriod('week', '2026-03-29'), 'Europe/London'),
    ).toEqual({
      from: '2026-03-16T00:00:00.000Z',
      to: '2026-03-29T23:00:00.000Z',
    });
  });
});

describe('labels', () => {
  it.each<[ReportRange, string, string | null, string]>([
    ['month', '2026-10-14', '1', '14 October'],
    ['month', '2026-10-01', null, '1 October'],
    ['week', '2026-10-14', '12', '14 October'],
    ['week', '2026-11-01', '26 October', '1 November'],
    ['year', '2026-10-14', 'January', 'October'],
    ['year', '2026-01-20', null, 'January'],
  ])('%s on %s reads from %s to %s', (range, today, from, to) => {
    expect(periodLabelParts(reportPeriod(range, today), today)).toEqual({
      from,
      to,
    });
  });

  it.each<[ReportRange, string, string, string]>([
    ['week', '2026-10-12', 'M', 'Mon 12 Oct'],
    ['week', '2026-10-18', 'S', 'Sun 18 Oct'],
    ['month', '2026-10-01', '1', 'Thu 1 Oct'],
    ['month', '2026-10-05', '5', 'Mon 5 Oct'],
    ['month', '2026-10-06', '', 'Tue 6 Oct'],
    ['year', '2026-03-01', 'M', 'March'],
  ])('labels the %s bar %s', (range, key, label, title) => {
    expect(bucketLabel(key, range)).toBe(label);
    expect(bucketTitle(key, range)).toBe(title);
  });

  it('names what the delta compares with', () => {
    expect(previousLabelParts(reportPeriod('week', '2026-10-14')).kind).toBe(
      'week',
    );
    expect(previousLabelParts(reportPeriod('month', '2026-10-14'))).toEqual({
      kind: 'month',
      label: 'September',
    });
    expect(previousLabelParts(reportPeriod('year', '2026-10-14'))).toEqual({
      kind: 'year',
      label: '2025',
    });
  });
});
