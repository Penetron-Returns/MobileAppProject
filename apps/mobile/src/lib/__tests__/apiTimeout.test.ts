import { apiRequest, isApiError } from '@/lib/api';

jest.mock('@/lib/env', () => ({
  env: { apiUrl: 'https://api.example.com' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key' }));

describe('apiRequest timeout', () => {
  const realFetch = global.fetch;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('turns a request that never answers into a retryable NETWORK_ERROR', async () => {
    global.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_res, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      })) as typeof fetch;
    const p = apiRequest('GET', '/health', { auth: false }).catch(
      (e: unknown) => e,
    );
    await jest.advanceTimersByTimeAsync(15_000);
    const error = await p;
    expect(isApiError(error) && error.code).toBe('NETWORK_ERROR');
    expect(isApiError(error) && error.isRetryable).toBe(true);
  });
});
