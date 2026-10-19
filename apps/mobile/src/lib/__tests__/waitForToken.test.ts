import { waitForToken } from '../auth-token';

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('waitForToken', () => {
  it('returns the token once Clerk can mint it', async () => {
    const answers = [null, null, 'tok'];
    const getToken = jest.fn(async () => answers.shift() ?? null);
    const token = await waitForToken({
      getToken,
      isSignedIn: () => true,
      ...clock(),
    });
    expect(token).toBe('tok');
    expect(getToken).toHaveBeenCalledTimes(3);
  });

  it('gives up with null after the timeout when no token ever comes', async () => {
    const c = clock();
    const getToken = jest.fn(async () => null);
    const token = await waitForToken({
      getToken,
      isSignedIn: () => true,
      timeoutMs: 8000,
      ...c,
    });
    expect(token).toBeNull();
    expect(c.now()).toBeLessThanOrEqual(8000);
    expect(c.now()).toBeGreaterThan(6000);
  });

  it('does not wait for a signed-out user', async () => {
    const getToken = jest.fn(async () => null);
    const token = await waitForToken({
      getToken,
      isSignedIn: () => false,
      ...clock(),
    });
    expect(token).toBeNull();
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('treats a throwing getToken as no token yet', async () => {
    const answers: (string | Error)[] = [new Error('boom'), 'tok'];
    const token = await waitForToken({
      getToken: async () => {
        const a = answers.shift();
        if (a instanceof Error) throw a;
        return a ?? null;
      },
      isSignedIn: () => true,
      ...clock(),
    });
    expect(token).toBe('tok');
  });
});
