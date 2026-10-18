import type { AttendanceCheckDTO } from '@booking/types';

import { mount, text } from '@/testing/render';

import { ClovieTabScreen } from '../components/ClovieTabScreen';

let mockSetup: { done: number; total: number; open: () => void } | null = null;
jest.mock('@/features/setup-checklist/useSetupStory', () => ({
  useSetupStory: () => mockSetup,
}));
jest.mock('../useAfterInteractions', () => ({
  useAfterInteractions: () => true,
}));
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Colin' } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/hooks/useNow', () => ({
  useNow: () => new Date('2026-10-17T07:00:00Z'), // 09:00 in Johannesburg
}));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({ data: { timezone: 'Africa/Johannesburg' } }),
}));
let mockSheet = { isAvailable: true, hasFailed: false };
jest.mock('@/features/companion/sdk/companionSheetControl', () => ({
  useCompanionSheet: () => mockSheet,
}));
const mockStartVoice = jest.fn();
jest.mock('../useStartVoice', () => ({ useStartVoice: () => mockStartVoice }));

// Nerova owns the chat UI: the screen only has to host it with the right props.
let mockMomentProps: Record<string, any> = {};
let mockRole = 'owner';
jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: { role: mockRole, business: { id: 'biz1' } } }),
}));
const mockOrder: string[] = [];
jest.mock('@nerova/react-native', () => ({
  CompanionSetupCard: () => {
    mockOrder.push('card');
    return null;
  },
  CompanionMoment: (props: Record<string, unknown>) => {
    mockMomentProps = props;
    mockOrder.push('moment');
    return null;
  },
}));

const mockAnswer = jest.fn();
let mockChecks: AttendanceCheckDTO[] = [];
jest.mock('@/features/attendance/hooks', () => ({
  useAttendance: () => ({
    checks: mockChecks,
    confirmation: null,
    answer: mockAnswer,
  }),
}));

let mockStories = { stories: [] as never[], isLoading: false };
jest.mock('../useStories', () => ({
  useStories: () => ({ ...mockStories, markViewed: jest.fn() }),
}));
jest.mock('../useStoryEvents', () => ({
  useStoryEvents: () => ({ record: jest.fn(), flush: jest.fn() }),
}));

function check(id: string, createdAt: string): AttendanceCheckDTO {
  return {
    id,
    created_at: createdAt,
    client_first_name: 'Daniel',
    service_name: 'Cut',
    starts_at: '2026-10-17T07:00:00Z',
  } as AttendanceCheckDTO;
}

beforeEach(() => {
  mockChecks = [];
  mockSetup = null;
  mockStories = { stories: [], isLoading: false };
  mockAnswer.mockReset();
  mockStartVoice.mockReset();
  mockSheet = { isAvailable: true, hasFailed: false };
  mockMomentProps = {};
  mockRole = 'owner';
  mockOrder.length = 0;
});

describe('ClovieTabScreen', () => {
  it('greets by local business time with the date line', () => {
    const out = text(mount(<ClovieTabScreen />));
    expect(out).toContain('Good morning, Colin');
    expect(out).toContain('Saturday 17 October');
  });

  it('shows skeleton rings while stories load and the placeholder when empty', () => {
    mockStories = { stories: [], isLoading: true };
    expect(
      mount(<ClovieTabScreen />).root.findAllByProps({
        testID: 'stories-skeleton',
      }).length,
    ).toBeGreaterThan(0);
    mockStories = { stories: [], isLoading: false };
    expect(
      mount(<ClovieTabScreen />).root.findAllByProps({
        testID: 'stories-skeleton',
      }),
    ).toHaveLength(0);
  });

  it('always shows the stories row with placeholder rings and the companion moment, even while setup is needed', () => {
    mockSetup = { done: 1, total: 7, open: jest.fn() };
    const tree = mount(<ClovieTabScreen />);
    expect(
      tree.root.findAllByProps({ testID: 'stories-row' }).length,
    ).toBeGreaterThan(0);
    expect(text(tree)).toContain('Client updates');
    expect(text(tree)).toContain('Get set up');
    expect(mockMomentProps.testID).toBe('clovie-moment');
  });

  it('keeps the quiet placeholder rings (no caption) when there are no stories and nothing to set up', () => {
    const tree = mount(<ClovieTabScreen />);
    expect(text(tree)).toContain('Client updates');
    expect(text(tree)).not.toContain('Updates will show here.');
    expect(mockMomentProps.testID).toBe('clovie-moment');
  });

  it('hosts the companion moment with a calm idle line and undo off', () => {
    mount(<ClovieTabScreen />);
    expect(mockMomentProps.idleLine).toBe('Ask me anything about your day.');
    expect(mockMomentProps.enableUndo).toBe(false);
    expect(typeof mockMomentProps.renderAvatar).toBe('function');
  });

  it('renders no chat area without a companion session', () => {
    mockSheet = { isAvailable: false, hasFailed: false };
    mount(<ClovieTabScreen />);
    expect(mockMomentProps).toEqual({});
  });

  it('renders the setup card above the moment for owners', () => {
    mount(<ClovieTabScreen />);
    expect(mockOrder.slice(0, 2)).toEqual(['card', 'moment']);
  });

  it('does not render the setup card for staff', () => {
    mockRole = 'staff';
    mount(<ClovieTabScreen />);
    expect(mockOrder).not.toContain('card');
    expect(mockOrder).toContain('moment');
  });

  it('does not render the setup card without a companion session', () => {
    mockSheet = { isAvailable: false, hasFailed: false };
    mount(<ClovieTabScreen />);
    expect(mockOrder).not.toContain('card');
  });

  it('starts native voice from the moment mic', () => {
    mount(<ClovieTabScreen />);
    mockMomentProps.onMicPress();
    expect(mockStartVoice).toHaveBeenCalledTimes(1);
  });

  it('maps attendance checks to queue items, oldest first', () => {
    mockChecks = [
      check('b', '2026-10-17T08:00:00Z'),
      check('a', '2026-10-17T07:00:00Z'),
    ];
    mount(<ClovieTabScreen />);
    const items = mockMomentProps.queueItems;
    expect(items.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
    expect(items[0].title).toBe('Did Daniel make it to their 09:00 Cut?');
    expect(items[0].actions.map((x: { id: string }) => x.id)).toEqual([
      'came',
      'no_show',
    ]);
  });

  it('answers the attendance check from a queue action', () => {
    mockChecks = [check('a', '2026-10-17T07:00:00Z')];
    mount(<ClovieTabScreen />);
    mockMomentProps.onQueueAction('a', 'no_show');
    expect(mockAnswer).toHaveBeenCalledWith(mockChecks[0], 'no_show');
    mockAnswer.mockClear();
    mockMomentProps.onQueueAction('a', 'unknown');
    mockMomentProps.onQueueAction('gone', 'came');
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});
