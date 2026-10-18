import * as SecureStore from 'expo-secure-store';

import { initialDraft, selectType } from '../logic';
import { clearOnboardingStorage, loadDraft, saveDraft } from '../storage';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((k: string) =>
    Promise.resolve(mockStore.get(k) ?? null),
  ),
  setItemAsync: jest.fn((k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((k: string) => {
    mockStore.delete(k);
    return Promise.resolve();
  }),
}));

beforeEach(() => mockStore.clear());
const draft = selectType(initialDraft(), 'salon');

describe('onboarding storage', () => {
  it('ignores a draft saved for another account', async () => {
    await saveDraft(draft, 'user_a');
    expect(await loadDraft('user_b')).toEqual(initialDraft());
  });

  it('loads a draft saved for the same account', async () => {
    await saveDraft(draft, 'user_a');
    expect((await loadDraft('user_a')).typeId).toBe('salon');
  });

  it('still loads a draft that has no owner (backward compatible)', async () => {
    await saveDraft(draft);
    expect((await loadDraft('user_a')).typeId).toBe('salon');
    expect((await loadDraft()).typeId).toBe('salon');
  });

  it('clears both the draft and the remembered type', async () => {
    mockStore.set('onboarding.draft.v1', '{}');
    mockStore.set('onboarding.type.v1', 'salon');
    await clearOnboardingStorage();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
    expect(mockStore.size).toBe(0);
  });
});
