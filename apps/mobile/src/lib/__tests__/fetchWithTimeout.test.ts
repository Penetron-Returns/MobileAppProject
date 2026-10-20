import { fetchWithTimeout, FetchTimeoutError } from '../fetchWithTimeout';

/** A fetch that never answers but honours abort, like the real one. */
const hanging: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
  });

describe('fetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fails with a timeout error when the server never answers', async () => {
    const p = fetchWithTimeout('http://x', {}, 15_000, hanging);
    const assertion = expect(p).rejects.toBeInstanceOf(FetchTimeoutError);
    jest.advanceTimersByTime(15_000);
    await assertion;
  });

  it('passes a prompt response through', async () => {
    const ok = jest.fn().mockResolvedValue({ ok: true });
    await expect(fetchWithTimeout('http://x', {}, 15_000, ok)).resolves.toEqual(
      {
        ok: true,
      },
    );
  });

  it('lets the caller cancel, as an AbortError rather than a timeout', async () => {
    const ctl = new AbortController();
    const p = fetchWithTimeout(
      'http://x',
      { signal: ctl.signal },
      15_000,
      hanging,
    );
    const assertion = expect(p).rejects.toMatchObject({ name: 'AbortError' });
    ctl.abort();
    await assertion;
  });
});
