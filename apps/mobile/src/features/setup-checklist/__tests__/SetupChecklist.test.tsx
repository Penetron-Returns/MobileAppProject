import * as React from 'react';

import { act, mount, pressableByLabel, text } from '@/testing/render';

import { GetSetUpScreen } from '../components/GetSetUpScreen';
import type { ChecklistInput } from '../logic';
import { useSetupStory } from '../useSetupStory';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
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
  isWhatsAppConnected: false,
  servicesCount: 4,
  hoursCount: 6,
  staffCount: 1,
  hasContactDetails: false,
  isVoiceOn: false,
  isPushGranted: false,
  reviewed: new Set(),
});

const speakers = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === 'Read aloud' && !!n.props.onPress,
  );

function story() {
  let value: ReturnType<typeof useSetupStory> = null;
  function Probe() {
    value = useSetupStory();
    return null;
  }
  mount(<Probe />);
  return value as ReturnType<typeof useSetupStory>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInput = baseInput();
  mockOwner = true;
});

describe('useSetupStory (the stories row bubble)', () => {
  it('reports progress out of eight and opens the full checklist', () => {
    const result = story();
    expect(result).toMatchObject({ done: 0, total: 8 });
    result?.open();
    expect(mockPush).toHaveBeenCalledWith('/settings/get-set-up');
  });

  it('is null for staff', () => {
    mockOwner = false;
    expect(story()).toBeNull();
  });

  it('is null while something is still loading', () => {
    mockInput = { ...baseInput(), servicesCount: null };
    expect(story()).toBeNull();
  });

  it('is null when everything is done', () => {
    mockInput = {
      ...baseInput(),
      platform: 'ios',
      isWhatsAppConnected: true,
      staffCount: 3,
      hasContactDetails: true,
      isPushGranted: true,
      reviewed: new Set(['services', 'hours', 'rules']),
    };
    expect(story()).toBeNull();
  });
});

describe('GetSetUpScreen', () => {
  it('lists every item and one tap marks it looked at and opens its screen', () => {
    const tree = mount(<GetSetUpScreen />);
    const out = text(tree);
    for (const item of [
      'Connect your WhatsApp',
      'Check services & prices',
      'Check opening hours',
      'Add your team',
      'Business details',
      'Booking rules',
      'Hey Clovie',
      'Notifications',
    ]) {
      expect(out).toContain(item);
    }
    expect(out).not.toContain('test message');
    act(() =>
      pressableByLabel(
        tree,
        'Check services & prices, not done',
      ).props.onPress(),
    );
    expect(mockMark).toHaveBeenCalledWith('services');
    expect(mockPush).toHaveBeenCalledWith('/settings/services');
  });

  it('has a speaker button on every row', () => {
    expect(speakers(mount(<GetSetUpScreen />)).length).toBeGreaterThanOrEqual(
      7,
    );
  });
});
