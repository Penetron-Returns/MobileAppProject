import * as React from 'react';

import { flush, mount } from '@/testing/render';

import {
  handleApprovalResponse,
  registerApprovalCategory,
  routeApprovalResponse,
  useApprovalNotifications,
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

const mockOpen = jest.fn();
jest.mock('../../companion/sdk/useOpenCompanion', () => ({
  useOpenCompanion: () => mockOpen,
}));

const mockDecide = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { voiceDecideApproval: (...a: unknown[]) => mockDecide(...a) },
}));

const mockFailed = jest.fn();
jest.mock('@/lib/toast', () => ({
  toast: { failed: (...a: unknown[]) => mockFailed(...a) },
}));

const push = { type: 'approval', approvalId: 'oapr_1', businessId: 'b1' };
const DEFAULT_TAP = 'expo.modules.notifications.actions.DEFAULT';

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
  mockDecide.mockResolvedValue({});
});

describe('registerApprovalCategory', () => {
  it('registers Approve and a destructive Decline that do not open the app', async () => {
    await registerApprovalCategory({ approve: 'Approve', decline: 'Decline' });
    expect(mockSetCategory).toHaveBeenCalledWith('clovie_approval', [
      {
        identifier: 'approve',
        buttonTitle: 'Approve',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'decline',
        buttonTitle: 'Decline',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);
  });
});

describe('routeApprovalResponse', () => {
  it.each([
    [
      'approve',
      push,
      { kind: 'decide', approvalId: 'oapr_1', decision: 'approve' },
    ],
    [
      'decline',
      push,
      { kind: 'decide', approvalId: 'oapr_1', decision: 'decline' },
    ],
    [DEFAULT_TAP, push, { kind: 'open-companion' }],
    ['approve', { type: 'attendance_check', checkId: 'c' }, { kind: 'ignore' }],
    ['approve', { type: 'approval' }, { kind: 'ignore' }],
    ['approve', undefined, { kind: 'ignore' }],
  ])('%s with %j', (action, data, expected) => {
    expect(routeApprovalResponse(action, data)).toEqual(expected);
  });
});

describe('handleApprovalResponse', () => {
  const handlers = {
    decide: jest.fn().mockResolvedValue(undefined),
    openCompanion: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());

  it('decides from a button without opening anything', async () => {
    await handleApprovalResponse(response('decline', push) as never, handlers);
    expect(handlers.decide).toHaveBeenCalledWith('oapr_1', 'decline');
    expect(handlers.openCompanion).not.toHaveBeenCalled();
  });

  it('opens the companion when the body is tapped', async () => {
    await handleApprovalResponse(
      response(DEFAULT_TAP, push) as never,
      handlers,
    );
    expect(handlers.openCompanion).toHaveBeenCalled();
    expect(handlers.decide).not.toHaveBeenCalled();
  });

  it('swallows a failed decision', async () => {
    handlers.decide.mockRejectedValueOnce(new Error('boom'));
    await expect(
      handleApprovalResponse(response('approve', push) as never, handlers),
    ).resolves.toBeUndefined();
  });
});

function Host({ enabled }: { enabled: boolean }) {
  useApprovalNotifications(enabled);
  return null;
}

describe('useApprovalNotifications', () => {
  it('registers the category and decides with a deterministic key', async () => {
    mount(<Host enabled />);
    await flush();
    expect(mockSetCategory).toHaveBeenCalledTimes(1);

    mockListener?.(response('approve', push));
    await flush();
    expect(mockDecide).toHaveBeenCalledWith(
      'oapr_1',
      'approve',
      'approval:oapr_1:approve',
    );
  });

  it('decides the action that launched the app, once', async () => {
    mockGetLast.mockResolvedValue(response('decline', push, 'n2'));
    mount(<Host enabled />);
    await flush();
    expect(mockDecide).toHaveBeenCalledWith(
      'oapr_1',
      'decline',
      'approval:oapr_1:decline',
    );
    expect(mockClear).toHaveBeenCalled();

    mockListener?.(response('decline', push, 'n2'));
    await flush();
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it('leaves other notifications (and their last response) alone', async () => {
    mockGetLast.mockResolvedValue(
      response('came', { type: 'attendance_check' }),
    );
    mount(<Host enabled />);
    await flush();
    mockListener?.(response('came', { type: 'attendance_check' }, 'x'));
    await flush();
    expect(mockDecide).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('opens the companion on a body tap', async () => {
    mount(<Host enabled />);
    await flush();
    mockListener?.(response(DEFAULT_TAP, push));
    await flush();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('toasts when the API refuses the decision', async () => {
    mockDecide.mockRejectedValue(new Error('410'));
    mount(<Host enabled />);
    await flush();
    mockListener?.(response('approve', push));
    await flush();
    expect(mockFailed).toHaveBeenCalled();
  });

  it('does nothing until enabled', async () => {
    mount(<Host enabled={false} />);
    await flush();
    expect(mockSetCategory).not.toHaveBeenCalled();
    expect(mockListener).toBeNull();
  });
});
