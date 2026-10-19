import { ApiError } from '@/lib/api';

import { meRetryDelay, shouldRetryMe } from '../me';

const err = (code: ApiError['code'], status: number) =>
  new ApiError({ code, message: 'x', status });

describe('shouldRetryMe', () => {
  it.each([
    ['missing token, first try', err('NOT_SIGNED_IN', 401), 0, true],
    ['missing token, fifth retry', err('NOT_SIGNED_IN', 401), 5, true],
    ['missing token, retries exhausted', err('NOT_SIGNED_IN', 401), 6, false],
    ['a real 401 never retries', err('UNAUTHENTICATED', 401), 0, false],
    ['network error retries twice', err('NETWORK_ERROR', 0), 1, true],
    ['network error stops after two', err('NETWORK_ERROR', 0), 2, false],
  ])('%s', (_name, error, count, expected) => {
    expect(shouldRetryMe(count, error)).toBe(expected);
  });
});

describe('meRetryDelay', () => {
  it('backs off and caps at two seconds', () => {
    expect([0, 1, 2, 3, 9].map(meRetryDelay)).toEqual([
      400, 800, 1600, 2000, 2000,
    ]);
  });
});
