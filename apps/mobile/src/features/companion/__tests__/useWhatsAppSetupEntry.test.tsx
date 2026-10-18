import { mount } from '@/testing/render';

import { useWhatsAppSetupEntry } from '../useWhatsAppSetupEntry';

const mockStart = jest.fn();
jest.mock('../hooks', () => ({
  useConnectWhatsApp: () => ({ start: mockStart, isStarting: false }),
}));
const mockOpenSetup = jest.fn();
let mockSheet = { isAvailable: true, openSetup: mockOpenSetup };
jest.mock('../sdk/companionSheetControl', () => ({
  useCompanionSheet: () => mockSheet,
}));

function Probe() {
  const entry = useWhatsAppSetupEntry({
    onOpened: jest.fn(),
    onClosed: jest.fn(),
    onAlreadyConnected: jest.fn(),
    onFailed: jest.fn(),
  });
  entry.start();
  return null;
}

beforeEach(() => jest.clearAllMocks());

describe('useWhatsAppSetupEntry', () => {
  it('opens Clovie setup when the SDK path is active', () => {
    mockSheet = { isAvailable: true, openSetup: mockOpenSetup };
    mount(<Probe />);
    expect(mockOpenSetup).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('falls back to the browser connect page when the SDK is off or failed', () => {
    mockSheet = { isAvailable: false, openSetup: mockOpenSetup };
    mount(<Probe />);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockOpenSetup).not.toHaveBeenCalled();
  });
});
