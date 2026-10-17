import * as React from 'react';

import { flush, mount } from '@/testing/render';

import {
  handleActionResponse,
  isTooLateToUndo,
  parseActionPush,
  registerActionCategory,
  routeActionResponse,
  useActionNotifications,
} from '../actionNotifications';

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

const mockUndo = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { voiceUndoAction: (...a: unknown[]) => mockUndo(...a) },
}));

const mockFailed = jest.fn();
const mockSuccess = jest.fn();
jest.mock('@/lib/toast', () => ({
  toast: {
    failed: (...a: unknown[]) => mockFailed(...a),
    success: (...a: unknown[]) => mockSuccess(...a),
  },
}));

const push = {
  type: 'action',
  actionId: 'oact_1',
  businessId: 'b1',
  undoUntil: '2026-10-16T08:00:30Z',
};
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
  mockUndo.mockResolvedValue({});
});

describe('registerActionCategory', () => {
  it('registers clovie_action with an Undo button that does not open the app', async () => {
    await registerActionCategory({ undo: 'Undo' });
    expect(mockSetCategory).toHaveBeenCalledWith('clovie_action', [
      {
        identifier: 'undo',
        buttonTitle: 'Undo',
        options: { opensAppToForeground: false },
      },
    ]);
  });
});

describe('parseActionPush', () => {
  it.each([
    [push, { actionId: 'oact_1' }],
    [{ type: 'approval', approvalId: 'oapr_1' }, null],
    [{ type: 'action' }, null],
    [{ type: 'action', actionId: '' }, null],
    [undefined, null],
    ['x', null],
  ])('%j gives %j', (data, expected) => {
    expect(parseActionPush(data)).toEqual(expected);
  });
});

describe('routeActionResponse', () => {
  it.each([
    ['undo', push, { kind: 'undo', actionId: 'oact_1' }],
    [DEFAULT_TAP, push, { kind: 'open-companion' }],
    ['undo', { type: 'approval', approvalId: 'oapr_1' }, { kind: 'ignore' }],
    ['undo', { type: 'action' }, { kind: 'ignore' }],
    ['undo', undefined, { kind: 'ignore' }],
  ])('%s with %j', (action, data, expected) => {
    expect(routeActionResponse(action, data)).toEqual(expected);
  });
});

describe('handleActionResponse', () => {
  const handlers = {
    undo: jest.fn().mockResolvedValue(undefined),
    openCompanion: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());

  it('undoes that action from the button without opening anything', async () => {
    await handleActionResponse(response('undo', push) as never, handlers);
    expect(handlers.undo).toHaveBeenCalledWith('oact_1');
    expect(handlers.openCompanion).not.toHaveBeenCalled();
  });

  it('opens the companion when the body is tapped', async () => {
    await handleActionResponse(response(DEFAULT_TAP, push) as never, handlers);
    expect(handlers.openCompanion).toHaveBeenCalled();
    expect(handlers.undo).not.toHaveBeenCalled();
  });

  it('ignores other notifications', async () => {
    await handleActionResponse(
      response('undo', { type: 'approval', approvalId: 'x' }) as never,
      handlers,
    );
    expect(handlers.undo).not.toHaveBeenCalled();
    expect(handlers.openCompanion).not.toHaveBeenCalled();
  });

  it('swallows a failed undo', async () => {
    handlers.undo.mockRejectedValueOnce(new Error('boom'));
    await expect(
      handleActionResponse(response('undo', push) as never, handlers),
    ).resolves.toBeUndefined();
  });
});

describe('isTooLateToUndo', () => {
  it.each([
    [
      {
        code: 'RULE_VIOLATION',
        details: { reason: 'action.undo_window_closed' },
      },
      true,
    ],
    [
      { code: 'RULE_VIOLATION', details: { reason: 'action.not_undoable' } },
      true,
    ],
    [
      { code: 'RULE_VIOLATION', details: { reason: 'action.undo_failed' } },
      false,
    ],
    [{ code: 'NOT_FOUND' }, false],
    [null, false],
  ])('%j is %j', (error, expected) => {
    expect(isTooLateToUndo(error)).toBe(expected);
  });
});

function Host({ enabled }: { enabled: boolean }) {
  useActionNotifications(enabled);
  return null;
}

describe('useActionNotifications', () => {
  it('registers the category and undoes with a deterministic key', async () => {
    mount(<Host enabled />);
    await flush();
    expect(mockSetCategory).toHaveBeenCalledTimes(1);

    mockListener?.(response('undo', push));
    await flush();
    expect(mockUndo).toHaveBeenCalledWith('oact_1', 'action:oact_1:undo');
    expect(mockSuccess).toHaveBeenCalledWith('Booking undone');
    expect(mockFailed).not.toHaveBeenCalled();
  });

  it('does not undo the same tap twice', async () => {
    mount(<Host enabled />);
    await flush();
    mockListener?.(response('undo', push, 'same'));
    mockListener?.(response('undo', push, 'same'));
    await flush();
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('shows "Too late to undo" when the window has closed', async () => {
    mockUndo.mockRejectedValue({
      code: 'RULE_VIOLATION',
      details: { reason: 'action.undo_window_closed' },
    });
    mount(<Host enabled />);
    await flush();
    mockListener?.(response('undo', push));
    await flush();
    expect(mockFailed).toHaveBeenCalledWith(
      'Too late to undo',
      expect.anything(),
    );
  });

  it('shows a general failure for any other error', async () => {
    mockUndo.mockRejectedValue({ code: 'NETWORK_ERROR' });
    mount(<Host enabled />);
    await flush();
    mockListener?.(response('undo', push));
    await flush();
    expect(mockFailed).toHaveBeenCalledWith(
      'Could not undo. Open Clovie to check.',
      expect.anything(),
    );
  });

  it('opens the companion on a body tap and ignores approval pushes', async () => {
    mount(<Host enabled />);
    await flush();
    mockListener?.(response(DEFAULT_TAP, push, 'n2'));
    mockListener?.(
      response('undo', { type: 'approval', approvalId: 'oapr_1' }, 'n3'),
    );
    await flush();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('handles the tap that launched the app from killed', async () => {
    mockGetLast.mockResolvedValue(response(DEFAULT_TAP, push, 'cold'));
    mount(<Host enabled />);
    await flush();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    mount(<Host enabled={false} />);
    await flush();
    expect(mockSetCategory).not.toHaveBeenCalled();
    expect(mockListener).toBeNull();
  });
});
