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

function pressDome(isAvailable: boolean, hasFailed = false) {
  const open = jest.fn();
  const tree = mount(
    <CompanionSheetControlProvider
      value={{
        isAvailable,
        hasFailed,
        open,
        close: jest.fn(),
      }}
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

  it('never opens a dead sheet: an unavailable sheet falls back to the route', () => {
    const open = pressDome(false, true);
    expect(open).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/companion');
  });

  describe('on the Clovie tab of the AI plans', () => {
    function renderDome(isHidden: boolean) {
      return mount(
        <CompanionSheetControlProvider
          value={{
            isAvailable: true,
            hasFailed: false,
            open: jest.fn(),
            close: jest.fn(),
          }}
        >
          <CompanionEntryDome isHidden={isHidden} />
        </CompanionSheetControlProvider>,
      );
    }
    const wrapper = (tree: ReturnType<typeof mount>) =>
      tree.root.findByProps({ testID: 'companion-dome-fade' });

    it('fades and shrinks out, takes no touches and hides from screen readers', () => {
      const tree = renderDome(true);
      const node = wrapper(tree);
      expect(node.props.style).toMatchObject({
        opacity: 0,
        transform: [{ scale: expect.any(Number) }],
      });
      expect(node.props.style.transform[0].scale).toBeLessThan(1);
      expect(node.props.pointerEvents).toBe('none');
      expect(node.props.accessibilityElementsHidden).toBe(true);
    });

    it('draws the still Clovie image, never a live canvas', () => {
      const tree = renderDome(false);
      const dome = tree.root.findByType(CompanionDome);
      expect(dome.props.character).toBeDefined();
      expect(dome.props.characterSlot).toBeUndefined();
    });

    it('is fully back on the other tabs', () => {
      const tree = renderDome(false);
      const node = wrapper(tree);
      expect(node.props.style).toMatchObject({
        opacity: 1,
        transform: [{ scale: 1 }],
      });
      expect(node.props.pointerEvents).toBe('auto');
    });
  });
});
