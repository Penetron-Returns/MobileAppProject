import type { AppStateStatus } from 'react-native';

import { startTokenPrewarm } from '../tokenPrewarm';

function setup(initial: AppStateStatus = 'active') {
  const getToken = jest.fn().mockResolvedValue('t');
  let listener: (s: AppStateStatus) => void = () => undefined;
  const stop = startTokenPrewarm({
    getToken,
    currentState: () => initial,
    onAppState: (cb) => {
      listener = cb;
      return () => undefined;
    },
    intervalMs: 45_000,
  });
  return { getToken, emit: (s: AppStateStatus) => listener(s), stop };
}

describe('startTokenPrewarm', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('warms at once and then every interval in the foreground', () => {
    const { getToken, stop } = setup();
    expect(getToken).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(90_000);
    expect(getToken).toHaveBeenCalledTimes(3);
    stop();
  });

  it('stops while backgrounded and warms again on return', () => {
    const { getToken, emit, stop } = setup();
    emit('background');
    jest.advanceTimersByTime(200_000);
    expect(getToken).toHaveBeenCalledTimes(1);
    emit('active');
    expect(getToken).toHaveBeenCalledTimes(2);
    stop();
    jest.advanceTimersByTime(200_000);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('does not warm when launched in the background', () => {
    const { getToken, stop } = setup('background');
    jest.advanceTimersByTime(200_000);
    expect(getToken).not.toHaveBeenCalled();
    stop();
  });
});
