import * as React from 'react';

import { mount } from '@/testing/render';

import { CompanionSdkRoute } from '../sdk/CompanionSdkRoute';
import { CompanionSheetControlProvider } from '../sdk/companionSheetControl';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: { heard?: string } = {};
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => mockCanGoBack,
    back: (...a: unknown[]) => mockBack(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
  },
  useLocalSearchParams: () => mockParams,
}));

const open = jest.fn();
function mountRoute() {
  return mount(
    <CompanionSheetControlProvider
      value={{
        isAvailable: true,
        hasFailed: false,
        open,
        close: jest.fn(),
      }}
    >
      <CompanionSdkRoute />
    </CompanionSheetControlProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockParams = {};
});

describe('CompanionSdkRoute', () => {
  it('opens the persistent sheet and goes back', () => {
    mountRoute();
    expect(open).toHaveBeenCalledWith(undefined);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('forwards the heard draft to the sheet', () => {
    mockParams = { heard: 'move Megan to Thursday' };
    mountRoute();
    expect(open).toHaveBeenCalledWith({ draft: 'move Megan to Thursday' });
  });

  it('replaces with Today when opened from a deep link with nothing to go back to', () => {
    mockCanGoBack = false;
    mountRoute();
    expect(open).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
