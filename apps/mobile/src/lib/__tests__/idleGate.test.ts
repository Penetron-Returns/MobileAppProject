import { resetShellIdleForTests, shellIdle } from '../idleGate';

describe('shellIdle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetShellIdleForTests();
  });
  afterEach(() => jest.useRealTimers());

  it('stays pending until idle plus the settle delay, then stays resolved', async () => {
    let done = false;
    const p = shellIdle(500).then(() => {
      done = true;
    });
    await jest.advanceTimersByTimeAsync(499);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    // A later caller is not delayed again.
    await expect(shellIdle(500)).resolves.toBeUndefined();
  });
});
