import type { AttendanceCheckDTO } from '@booking/types';

import { mount, pressableByLabel, text } from '@/testing/render';

import { ClovieTabScreen } from '../components/ClovieTabScreen';

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
jest.mock('@/features/companion/sdk/useOpenCompanion', () => ({
  useOpenCompanion: () => jest.fn(),
}));
jest.mock('../useStartVoice', () => ({ useStartVoice: () => jest.fn() }));

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
  mockStories = { stories: [], isLoading: false };
  mockAnswer.mockReset();
});

describe('ClovieTabScreen', () => {
  it('greets by local business time with the date line', () => {
    const out = text(mount(<ClovieTabScreen />));
    expect(out).toContain('Good morning, Colin');
    expect(out).toContain('Saturday 17 October');
  });

  it('shows skeleton rings while stories load and none when empty', () => {
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

  it('offers the chat and voice entries', () => {
    const tree = mount(<ClovieTabScreen />);
    expect(pressableByLabel(tree, 'Ask Clovie anything')).toBeTruthy();
    expect(pressableByLabel(tree, 'Talk to Clovie')).toBeTruthy();
  });

  it('asks about one attendance check at a time with a count of the rest', () => {
    mockChecks = [
      check('a', '2026-10-17T07:00:00Z'),
      check('b', '2026-10-17T08:00:00Z'),
    ];
    const tree = mount(<ClovieTabScreen />);
    expect(text(tree)).toContain('Did Daniel make it to their 09:00 Cut?');
    expect(text(tree)).toContain('1 more');
    pressableByLabel(tree, 'Mark Daniel as came').props.onPress();
    expect(mockAnswer).toHaveBeenCalledWith(mockChecks[0], 'came');
  });
});
