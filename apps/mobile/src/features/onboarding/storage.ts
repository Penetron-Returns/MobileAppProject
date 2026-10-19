import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { initialDraft, parseDraft, type OnboardingDraft } from './logic';

const KEY = 'onboarding.draft.v1';

/**
 * Best effort throughout: a store that fails just means onboarding starts over after a kill.
 * With a userId, a draft saved for a different account is ignored (stale after an account
 * switch). Drafts saved without an owner still load.
 */
export async function loadDraft(userId?: string): Promise<OnboardingDraft> {
  if (Platform.OS === 'web') return initialDraft();
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const owner = raw ? storedOwner(raw) : null;
    if (userId && owner && owner !== userId) return initialDraft();
    return parseDraft(raw);
  } catch {
    return initialDraft();
  }
}

function storedOwner(raw: string): string | null {
  try {
    const value: unknown = JSON.parse(raw);
    const owner = (value as { userId?: unknown } | null)?.userId;
    return typeof owner === 'string' ? owner : null;
  } catch {
    return null;
  }
}

export async function saveDraft(
  draft: OnboardingDraft,
  userId?: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const body = userId ? { ...draft, userId } : draft;
    await SecureStore.setItemAsync(KEY, JSON.stringify(body));
  } catch {
    // Not critical.
  }
}

export async function clearDraft(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Not critical.
  }
}

/** Forgets everything onboarding remembers on this device (sign-out, or onboarding finished). */
export const clearOnboardingStorage = clearDraft;
