import { AppRegistry, Platform } from 'react-native';

import { whenIdle } from '@/lib/whenIdle';

import { registerVoiceHeadlessTask } from '../headlessRegistration';

const mockRun = jest.fn().mockResolvedValue(undefined);
let mockLoaded = false;
jest.mock('@/lib/whenIdle', () => ({ whenIdle: jest.fn() }));
jest.mock('../headlessTask', () => {
  mockLoaded = true;
  return { runVoiceHeadlessTask: mockRun, syncCloudSttFlag: jest.fn() };
});

describe('registerVoiceHeadlessTask', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original });
    jest.restoreAllMocks();
  });

  it('registers the task at once without loading its code, which loads on first run', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const register = jest
      .spyOn(AppRegistry, 'registerHeadlessTask')
      .mockImplementation(() => undefined);
    registerVoiceHeadlessTask();
    expect(register).toHaveBeenCalledWith(
      'ClovieVoiceCommand',
      expect.any(Function),
    );
    expect(mockLoaded).toBe(false);
    expect(whenIdle).toHaveBeenCalledTimes(1);

    const provider = register.mock.calls[0][1];
    await provider()({ id: 'x', prefetch: true });
    expect(mockLoaded).toBe(true);
    expect(mockRun).toHaveBeenCalledWith({ id: 'x', prefetch: true });
  });

  it('does nothing off Android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    const register = jest.spyOn(AppRegistry, 'registerHeadlessTask');
    registerVoiceHeadlessTask();
    expect(register).not.toHaveBeenCalled();
  });
});
