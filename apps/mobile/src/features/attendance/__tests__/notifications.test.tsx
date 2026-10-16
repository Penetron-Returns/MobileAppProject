import * as React from 'react';

import { flush, mount } from '@/testing/render';

import {
  handleAttendanceResponse,
  registerAttendanceCategory,
  routeAttendanceResponse,
  useAttendanceNotifications,
} from '../notifications';

const mockSetCategory = jest.fn().mockResolvedValue({});
const mockGetLast = jest.fn().mockResolvedValue(null);
const mockClear = jest.fn().mockResolvedValue(undefined);
let mockListener: ((response: unknown) => void) | null = null;
jest.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: (...a: unknown[]) => mockSetCategory(...a),
  getLastNotificationResponseAsync: () => mockGetLast(),
  clearLastNotificationResponseAsync: () => mockClear(),
  addNotificationResponseReceivedListener: (fn: (r: unknown) => void) => {
    mockListener = fn;
    return { remove: jest.fn() };
  },
}));

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    navigate: (...a: unknown[]) => mockNavigate(...a),
    push: (...a: unknown[]) => mockPush(...a),
  },
}));

const mockAnswer = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { answerAttendance: (...a: unknown[]) => mockAnswer(...a) },
}));

const single = { type: 'attendance_check', checkId: 'c1', appointmentId: 'a1' };

function response(actionIdentifier: string, data: unknown, id = 'n1') {
  return {
    actionIdentifier,
    notification: { request: { identifier: id, content: { data } } },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListener = null;
  mockGetLast.mockResolvedValue(null);
  mockAnswer.mockResolvedValue({});
});

describe('registerAttendanceCategory', () => {
  it('registers Came and a destructive No-show that do not open the app', async () => {
    await registerAttendanceCategory({ came: 'Came', noShow: 'No-show' });
    expect(mockSetCategory).toHaveBeenCalledWith('attendance_check', [
      {
        identifier: 'came',
        buttonTitle: 'Came',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'no_show',
        buttonTitle: 'No-show',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);
  });
});

describe('routeAttendanceResponse', () => {
  it.each([
    ['came', single, { kind: 'answer', checkId: 'c1', outcome: 'came' }],
    ['no_show', single, { kind: 'answer', checkId: 'c1', outcome: 'no_show' }],
    [
      'expo.modules.notifications.actions.DEFAULT',
      single,
      { kind: 'open-home' },
    ],
    [
      'expo.modules.notifications.actions.DEFAULT',
      { type: 'attendance_batch', count: '3' },
      { kind: 'open-list' },
    ],
    ['came', { type: 'attendance_summary', count: '2' }, { kind: 'open-list' }],
    ['came', { type: 'new_booking' }, { kind: 'ignore' }],
    ['came', undefined, { kind: 'ignore' }],
  ])('%s with %j', (action, data, expected) => {
    expect(routeAttendanceResponse(action, data)).toEqual(expected);
  });
});

describe('handleAttendanceResponse', () => {
  const handlers = {
    answer: jest.fn().mockResolvedValue(undefined),
    openHome: jest.fn(),
    openList: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());

  it('answers from an action without opening anything', async () => {
    await handleAttendanceResponse(
      response('no_show', single) as never,
      handlers,
    );
    expect(handlers.answer).toHaveBeenCalledWith('c1', 'no_show');
    expect(handlers.openHome).not.toHaveBeenCalled();
  });

  it('opens Home when the body is tapped', async () => {
    await handleAttendanceResponse(
      response('default', single) as never,
      handlers,
    );
    expect(handlers.openHome).toHaveBeenCalled();
  });

  it('opens the grouped list for a batch', async () => {
    await handleAttendanceResponse(
      response('default', { type: 'attendance_batch', count: '3' }) as never,
      handlers,
    );
    expect(handlers.openList).toHaveBeenCalled();
  });

  it('swallows a failed answer (the hook already toasts)', async () => {
    handlers.answer.mockRejectedValueOnce(new Error('boom'));
    await expect(
      handleAttendanceResponse(response('came', single) as never, handlers),
    ).resolves.toBeUndefined();
  });
});

function Host({ enabled }: { enabled: boolean }) {
  useAttendanceNotifications(enabled);
  return null;
}

describe('useAttendanceNotifications', () => {
  it('registers the category and answers an action with the deterministic key', async () => {
    mount(<Host enabled />);
    await flush();
    expect(mockSetCategory).toHaveBeenCalledTimes(1);

    mockListener?.(response('came', single));
    await flush();
    expect(mockAnswer).toHaveBeenCalledWith(
      'c1',
      { outcome: 'came' },
      'attendance:c1:came',
    );
  });

  it('answers the action that launched the app, once', async () => {
    mockGetLast.mockResolvedValue(response('no_show', single, 'n2'));
    mount(<Host enabled />);
    await flush();
    expect(mockAnswer).toHaveBeenCalledWith(
      'c1',
      { outcome: 'no_show' },
      'attendance:c1:no_show',
    );
    expect(mockClear).toHaveBeenCalled();

    mockListener?.(response('no_show', single, 'n2'));
    await flush();
    expect(mockAnswer).toHaveBeenCalledTimes(1);
  });

  it('navigates for body and batch taps', async () => {
    mount(<Host enabled />);
    await flush();
    mockListener?.(
      response('expo.modules.notifications.actions.DEFAULT', single, 'a'),
    );
    mockListener?.(
      response(
        'expo.modules.notifications.actions.DEFAULT',
        { type: 'attendance_batch', count: '2' },
        'b',
      ),
    );
    await flush();
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(mockPush).toHaveBeenCalledWith('/attendance');
  });

  it('does nothing until enabled', async () => {
    mount(<Host enabled={false} />);
    await flush();
    expect(mockSetCategory).not.toHaveBeenCalled();
    expect(mockListener).toBeNull();
  });
});
