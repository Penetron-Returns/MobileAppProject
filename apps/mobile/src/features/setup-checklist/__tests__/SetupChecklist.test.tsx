import * as React from 'react';

import { act, mount, pressableByLabel, text } from '@/testing/render';

import { GetSetUpScreen } from '../components/GetSetUpScreen';
import { SetupChecklistCard } from '../components/SetupChecklistCard';
import type { ChecklistInput } from '../logic';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
}));
const mockOpenSetup = jest.fn();
jest.mock('@/features/companion/sdk/companionSheetControl', () => ({
  useCompanionSheet: () => ({ openSetup: mockOpenSetup }),
}));
const mockMark = jest.fn();
let mockOwner = true;
let mockInput: ChecklistInput;
jest.mock('../useSetupChecklist', () => ({
  useSetupChecklist: () => ({
    ...jest.requireActual('../logic').deriveChecklist(mockInput),
    isOwner: mockOwner,
    markReviewed: mockMark,
  }),
}));

const baseInput = (): ChecklistInput => ({
  platform: 'android',
  servicesCount: 4,
  hoursCount: 6,
  staffCount: 1,
  hasContactDetails: false,
  isVoiceOn: false,
  isPushGranted: false,
  isTestMessageDone: false,
  reviewed: new Set(),
});

const speakers = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === 'Read aloud' && !!n.props.onPress,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockInput = baseInput();
  mockOwner = true;
});

describe('SetupChecklistCard (Clovie tab)', () => {
  it('shows progress and only the next item, with a speaker button', () => {
    const tree = mount(<SetupChecklistCard />);
    const out = text(tree);
    expect(out).toContain('Get set up');
    expect(out).toContain('0 of 8 done');
    expect(out).toContain('Check services & prices');
    expect(out).not.toContain('Check opening hours');
    expect(speakers(tree).length).toBeGreaterThan(0);
  });

  it('one tap marks the item looked at and opens its settings screen', () => {
    const tree = mount(<SetupChecklistCard />);
    act(() =>
      pressableByLabel(
        tree,
        'Check services & prices, not done',
      ).props.onPress(),
    );
    expect(mockMark).toHaveBeenCalledWith('services');
    expect(mockPush).toHaveBeenCalledWith('/settings/services');
  });

  it('is hidden for staff', () => {
    mockOwner = false;
    expect(text(mount(<SetupChecklistCard />))).not.toContain('Get set up');
  });

  it('is hidden while something is still loading', () => {
    mockInput = { ...baseInput(), servicesCount: null };
    expect(text(mount(<SetupChecklistCard />))).not.toContain('Get set up');
  });

  it('is hidden when everything is done', () => {
    mockInput = {
      ...baseInput(),
      platform: 'ios',
      staffCount: 3,
      hasContactDetails: true,
      isPushGranted: true,
      isTestMessageDone: true,
      reviewed: new Set(['services', 'hours', 'rules']),
    };
    expect(text(mount(<SetupChecklistCard />))).not.toContain('Get set up');
  });
});

describe('GetSetUpScreen', () => {
  it("lists every item, and the test message opens Nerova's sheet on that step", () => {
    const tree = mount(<GetSetUpScreen />);
    const out = text(tree);
    for (const item of [
      'Check services & prices',
      'Check opening hours',
      'Add your team',
      'Business details',
      'Booking rules',
      'Hey Clovie',
      'Notifications',
      'Send a test message',
    ]) {
      expect(out).toContain(item);
    }
    act(() =>
      pressableByLabel(tree, 'Send a test message, not done').props.onPress(),
    );
    expect(mockOpenSetup).toHaveBeenCalledWith('test_message');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('has a speaker button on every row', () => {
    // Each speaker button appears as a wrapper and its inner node: eight rows, at least eight buttons.
    expect(speakers(mount(<GetSetUpScreen />)).length).toBeGreaterThanOrEqual(
      8,
    );
  });
});
