import { Alert, Linking } from 'react-native';

import { askOverlayAccess } from '../overlayAccess';
import { openBatterySettings } from '../permissions';

const mockRequestOverlay = jest.fn();
jest.mock('../clovieVoice', () => ({
  requestOverlayPermission: () => mockRequestOverlay(),
}));

const t = (key: string) => key;

describe('askOverlayAccess', () => {
  beforeEach(() => mockRequestOverlay.mockClear());

  it('opens the system page only after the owner continues', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'voice.overlay.continue')?.onPress?.();
    });
    await askOverlayAccess(t);
    expect(mockRequestOverlay).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the owner cancels', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    await askOverlayAccess(t);
    expect(mockRequestOverlay).not.toHaveBeenCalled();
  });
});

describe('openBatterySettings', () => {
  it('opens the battery optimisation list, not the restricted direct prompt', async () => {
    const send = jest.spyOn(Linking, 'sendIntent').mockResolvedValue();
    await openBatterySettings();
    expect(send).toHaveBeenCalledWith(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
  });

  it('falls back to the app settings when the intent is unavailable', async () => {
    jest.spyOn(Linking, 'sendIntent').mockRejectedValue(new Error('none'));
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await openBatterySettings();
    expect(open).toHaveBeenCalled();
  });
});
