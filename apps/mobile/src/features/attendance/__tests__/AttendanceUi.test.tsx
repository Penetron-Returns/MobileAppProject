import type { AttendanceCheckDTO, MeDTO } from '@booking/types';
import * as React from 'react';

import { ApiError } from '@/lib/api';
import { act, flush, mount, pressableByLabel, text } from '@/testing/render';

import { AttendanceModeScreen } from '../components/AttendanceModeScreen';
import { useAttendance } from '../hooks';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));

const mockShowToast = jest.fn();
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  showToast: (...a: unknown[]) => mockShowToast(...a),
}));

const mockAnswer = jest.fn();
const mockUpdateBusiness = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  newIdempotencyKey: () => 'key-1',
  api: {
    answerAttendance: (...a: unknown[]) => mockAnswer(...a),
    attendancePending: jest.fn().mockResolvedValue({ count: 0, checks: [] }),
    updateBusiness: (...a: unknown[]) => mockUpdateBusiness(...a),
  },
}));

let mockMe: { data?: Partial<MeDTO> } = {};
let mockCanManage = true;
jest.mock('@/features/business/me', () => ({
  useMe: () => mockMe,
  useCanManage: () => mockCanManage,
}));

function check(id: string, name: string, startsAt: string): AttendanceCheckDTO {
  return {
    id,
    appointment_id: `appt-${id}`,
    status: 'pending',
    outcome: null,
    audience: 'staff',
    escalated: false,
    created_at: startsAt,
    answered_at: null,
    client_first_name: name,
    service_name: 'cut',
    starts_at: startsAt,
    ends_at: startsAt,
  };
}

const thandi = check('c1', 'Thandi', '2026-10-14T12:00:00.000Z'); // 14:00

beforeEach(() => {
  jest.clearAllMocks();
  mockAnswer.mockResolvedValue({});
  mockCanManage = true;
  mockMe = {};
});

describe('useAttendance', () => {
  function Host({ client }: { client: { current: unknown } }) {
    client.current = useAttendance();
    return null;
  }
  type View = ReturnType<typeof useAttendance>;

  it('keeps the confirmation until the next answer replaces it', async () => {
    jest.useFakeTimers();
    const ref: { current: unknown } = { current: null };
    mount(<Host client={ref} />);
    await act(async () => {
      await (ref.current as View).answer(thandi, 'came');
    });
    expect((ref.current as View).confirmation).toBe('Marked Thandi as came');
    expect(mockAnswer).toHaveBeenCalledWith(
      'c1',
      { outcome: 'came' },
      'attendance:c1:came',
    );
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect((ref.current as View).confirmation).toBe('Marked Thandi as came');
    jest.useRealTimers();
  });

  it('drops the confirmation when the API refuses', async () => {
    mockAnswer.mockRejectedValue(new Error('nope'));
    const ref: { current: unknown } = { current: null };
    mount(<Host client={ref} />);
    let ok = true;
    await act(async () => {
      ok = await (ref.current as View).answer(thandi, 'no_show');
    });
    expect(ok).toBe(false);
    expect((ref.current as View).confirmation).toBeNull();
  });

  it('resends a dropped request with the same key and still confirms', async () => {
    mockAnswer
      .mockRejectedValueOnce(
        new ApiError({ code: 'NETWORK_ERROR', message: 'down', status: 0 }),
      )
      .mockResolvedValueOnce({});
    const ref: { current: unknown } = { current: null };
    mount(<Host client={ref} />);
    let ok = false;
    await act(async () => {
      ok = await (ref.current as View).answer(thandi, 'came');
    });
    expect(ok).toBe(true);
    expect(mockAnswer).toHaveBeenCalledTimes(2);
    expect(mockAnswer.mock.calls[1]).toEqual(mockAnswer.mock.calls[0]);
    expect((ref.current as View).confirmation).toBe('Marked Thandi as came');
  });

  it('does not resend a refusal and says why it was not saved', async () => {
    mockAnswer.mockRejectedValue(
      new ApiError({ code: 'FORBIDDEN', message: 'no', status: 403 }),
    );
    const ref: { current: unknown } = { current: null };
    mount(<Host client={ref} />);
    await act(async () => {
      await (ref.current as View).answer(thandi, 'came');
    });
    expect(mockAnswer).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't save that answer",
        description: "You don't have access to do that.",
      }),
    );
  });
});

describe('AttendanceModeScreen', () => {
  const me = (mode: 'staff' | 'owner') => ({
    data: { business: { attendance_mode: mode } } as MeDTO,
  });

  it('lets an owner pick who confirms, with the recommended tag', async () => {
    mockMe = me('staff');
    mockUpdateBusiness.mockResolvedValue({});
    const tree = mount(<AttendanceModeScreen />);
    const out = text(tree);
    expect(out).toContain('Each staff member for their own clients');
    expect(out).toContain('Recommended');
    expect(out).toContain('The owner confirms everyone');

    act(() =>
      pressableByLabel(tree, 'The owner confirms everyone').props.onPress(),
    );
    await flush();
    expect(mockUpdateBusiness).toHaveBeenCalledWith(
      { attendance_mode: 'owner' },
      'key-1',
    );
  });

  it('does not re-save the mode that is already selected', () => {
    mockMe = me('staff');
    const tree = mount(<AttendanceModeScreen />);
    act(() =>
      pressableByLabel(
        tree,
        'Each staff member for their own clients, selected',
      ).props.onPress(),
    );
    expect(mockUpdateBusiness).not.toHaveBeenCalled();
  });

  it('shows staff both options read-only, with the owner-only note', () => {
    mockCanManage = false;
    mockMe = me('staff');
    const tree = mount(<AttendanceModeScreen />);
    const out = text(tree);
    expect(out).toContain('The owner confirms everyone');
    expect(out).toContain('Each staff member for their own clients');
    expect(out).toContain('Only the owner can change this.');
    expect(() =>
      pressableByLabel(tree, 'The owner confirms everyone'),
    ).toThrow();
    expect(mockUpdateBusiness).not.toHaveBeenCalled();
  });
});
