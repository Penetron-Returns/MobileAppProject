import { isOnlineFromNetInfo } from '../online';

describe('isOnlineFromNetInfo', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: null, isInternetReachable: null }, true],
    [{ isConnected: false, isInternetReachable: false }, false],
    [{ isConnected: false, isInternetReachable: null }, false],
    [{ isConnected: true, isInternetReachable: false }, false],
  ])('%j is online: %s', (state, expected) => {
    expect(isOnlineFromNetInfo(state)).toBe(expected);
  });
});
