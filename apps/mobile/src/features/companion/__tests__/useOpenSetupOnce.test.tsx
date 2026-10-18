import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react-test-renderer';

import { mount } from '@/testing/render';

import { setupOpenedKey, useOpenSetupOnce } from '../useOpenSetupOnce';

jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: { role: 'owner', business: { id: 'biz1' } } }),
}));
let mockSetup: unknown;
jest.mock('../hooks', () => ({
  useCompanionSetup: () => ({ data: mockSetup }),
}));
const mockOpen = jest.fn();
jest.mock('../sdk/companionSheetControl', () => ({
  useCompanionSheet: () => ({ isAvailable: true, open: mockOpen }),
}));

function Probe() {
  useOpenSetupOnce();
  return null;
}
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockSetup = { next_step: 'connect_whatsapp', companion_live: false };
});

describe('useOpenSetupOnce', () => {
  it('opens the sheet once, then never again for the business', async () => {
    mount(<Probe />);
    await flush();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(setupOpenedKey('biz1'))).toBe('1');
    mount(<Probe />);
    await flush();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('does nothing when WhatsApp is not the next step', async () => {
    mockSetup = { next_step: 'none', companion_live: true };
    mount(<Probe />);
    await flush();
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
