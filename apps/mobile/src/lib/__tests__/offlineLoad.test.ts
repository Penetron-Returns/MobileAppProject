import { isApiError } from '../api';
import { isFailed, loadError } from '../offline';

const base = {
  isError: false,
  error: null,
  isPending: false,
  fetchStatus: 'idle' as const,
};

describe('loadError', () => {
  it('is null for a query that loaded or is loading', () => {
    expect(loadError(base)).toBeNull();
    expect(
      loadError({ ...base, isPending: true, fetchStatus: 'fetching' }),
    ).toBeNull();
  });

  it('passes a real error through', () => {
    const error = new Error('boom');
    expect(loadError({ ...base, isError: true, error })).toBe(error);
  });

  it('reads a first load that is paused as an offline error, not an endless skeleton', () => {
    const error = loadError({
      ...base,
      isPending: true,
      fetchStatus: 'paused',
    });
    expect(isApiError(error) && error.code).toBe('OFFLINE');
  });

  it('keeps showing saved data when a refresh is paused', () => {
    expect(isFailed({ ...base, fetchStatus: 'paused' })).toBe(false);
  });
});
