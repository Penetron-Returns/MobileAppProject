import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { flush } from '@/testing/render';

import { initialDraft, selectType } from '../logic';
import { useOnboardingDraft } from '../useOnboardingDraft';

let mockUserId: string | null = null;
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ userId: mockUserId }),
}));
const mockLoad = jest.fn();
const mockSave = jest.fn();
jest.mock('../storage', () => ({
  loadDraft: (...a: unknown[]) => mockLoad(...a),
  saveDraft: (...a: unknown[]) => mockSave(...a),
}));

function mountHook() {
  const out: { current: ReturnType<typeof useOnboardingDraft> | null } = {
    current: null,
  };
  function Probe() {
    out.current = useOnboardingDraft();
    return null;
  }
  act(() => void renderer.create(<Probe />));
  return out as { current: ReturnType<typeof useOnboardingDraft> };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockResolvedValue(initialDraft());
});

describe('useOnboardingDraft', () => {
  it('reads and saves the draft for the signed-in user', async () => {
    mockUserId = 'user_1';
    const hook = mountHook();
    await flush();
    expect(mockLoad).toHaveBeenCalledWith('user_1');
    act(() => hook.current.update((d) => selectType(d, 'salon')));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: 'salon' }),
      'user_1',
    );
  });

  it('works without a user while signed out', async () => {
    mockUserId = null;
    const hook = mountHook();
    await flush();
    expect(mockLoad).toHaveBeenCalledWith(undefined);
    act(() => hook.current.update((d) => selectType(d, 'mix')));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: 'mix' }),
      undefined,
    );
  });
});
