import { isShowingSavedCopy, savedCopyTime } from '../offline';

describe('isShowingSavedCopy', () => {
  it.each([
    [
      'never loaded',
      { isError: true, fetchStatus: 'idle', dataUpdatedAt: 0 },
      false,
    ],
    [
      'loaded, refresh failed',
      { isError: true, fetchStatus: 'idle', dataUpdatedAt: 1 },
      true,
    ],
    [
      'loaded, paused offline',
      { isError: false, fetchStatus: 'paused', dataUpdatedAt: 1 },
      true,
    ],
    [
      'loaded and healthy',
      { isError: false, fetchStatus: 'idle', dataUpdatedAt: 1 },
      false,
    ],
    [
      'loaded and refreshing',
      { isError: false, fetchStatus: 'fetching', dataUpdatedAt: 1 },
      false,
    ],
  ] as const)('%s', (_l, q, expected) => {
    expect(isShowingSavedCopy({ ...q })).toBe(expected);
  });
});

describe('savedCopyTime', () => {
  it('formats in the business timezone', () => {
    const at = Date.parse('2026-10-14T08:32:00Z');
    expect(savedCopyTime(at, 'Africa/Johannesburg')).toBe('10:32');
  });
  it('is null when nothing was loaded', () => {
    expect(savedCopyTime(0, 'Africa/Johannesburg')).toBeNull();
  });
});
