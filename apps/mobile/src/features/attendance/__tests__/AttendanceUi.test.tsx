import type { AttendanceCheckDTO, MeDTO } from '@booking/types';
import type { Approval } from '@nerova/react-native';
import * as React from 'react';

import { NeedsYou } from '@/features/today/components/ai/NeedsYou';
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

const TZ = 'Africa/Johannesburg';

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
const sam = check('c2', 'Sam', '2026-10-14T13:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockAnswer.mockResolvedValue({});
  mockCanManage = true;
  mockMe = {};
});

describe('NeedsYou with attendance', () => {
  function render(
    attendance: AttendanceCheckDTO[],
    onAnswer = jest.fn(),
    onOpen = jest.fn(),
    pending: Approval[] = [],
  ) {
    return mount(
      <NeedsYou
        pending={pending}
        attendance={attendance}
        timezone={TZ}
        busyId={null}
        onApprove={jest.fn()}
        onAnswerAttendance={onAnswer}
        onOpenAttendance={onOpen}
        onOpenClovie={jest.fn()}
      />,
    );
  }

  it('shows the question as the amber Needs you card', () => {
    const tree = render([thandi]);
    const out = text(tree);
    expect(out).toContain('Needs you · 1');
    expect(out).toContain('Did Thandi make it to their 14:00 cut?');
    expect(out).not.toContain('Approve');
  });

  it('answers Came and No-show with the question that was shown', () => {
    const onAnswer = jest.fn();
    const tree = render([thandi], onAnswer);
    act(() => pressableByLabel(tree, 'Mark Thandi as came').props.onPress());
    act(() =>
      pressableByLabel(tree, 'Mark Thandi as a no-show').props.onPress(),
    );
    expect(onAnswer).toHaveBeenNthCalledWith(1, thandi, 'came');
    expect(onAnswer).toHaveBeenNthCalledWith(2, thandi, 'no_show');
  });

  it('counts approvals and offers the grouped list when several clients wait', () => {
    const onOpen = jest.fn();
    const tree = render([sam, thandi], jest.fn(), onOpen, [
      { id: 'ap1', title: 'Cancel Lee' } as Approval,
    ]);
    expect(text(tree)).toContain('Needs you · 3');
    expect(text(tree)).toContain('Thandi make it'); // oldest first
    act(() => pressableByLabel(tree, '2 clients to confirm').props.onPress());
    expect(onOpen).toHaveBeenCalled();
  });

  it('hides the grouped link for a single client', () => {
    const tree = render([thandi]);
    expect(() => pressableByLabel(tree, '1 client to confirm')).toThrow();
  });

  it('shows the all-clear when nothing is waiting', () => {
    expect(text(render([]))).toContain('Nothing needs you');
  });
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
