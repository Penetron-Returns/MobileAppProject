import { CompanionDome } from '@booking/ui';
import * as React from 'react';

import { mount } from '@/testing/render';

import { CompanionEntryDome } from '../components/CompanionEntryDome';
import { CompanionSheetControlProvider } from '../sdk/companionSheetControl';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));
jest.mock('../useCompanionEntry', () => ({
  useCompanionEntry: () => ({ isVisible: true, attentionCount: 0 }),
}));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));

function pressDome(isAvailable: boolean) {
  const open = jest.fn();
  const tree = mount(
    <CompanionSheetControlProvider
      value={{ isAvailable, open, close: jest.fn() }}
    >
      <CompanionEntryDome />
    </CompanionSheetControlProvider>,
  );
  tree.root.findByType(CompanionDome).props.onPress();
  return open;
}

beforeEach(() => jest.clearAllMocks());

describe('CompanionEntryDome', () => {
  it('opens the persistent sheet without navigating', () => {
    const open = pressDome(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('pushes the companion route when no persistent sheet is mounted', () => {
    const open = pressDome(false);
    expect(open).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/companion');
  });
});
