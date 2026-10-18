import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  BUSINESS_TYPE_IDS,
  initialDraft,
  parseDraft,
  type BusinessTypeId,
  type OnboardingDraft,
} from './logic';

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

const TYPE_KEY = 'onboarding.type.v1';

/**
 * The business type is not stored on the business, so remember it for the one
 * moment it is needed again: Back from the plan screen reopens the name and type.
 */
export async function saveBusinessType(typeId: BusinessTypeId): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(TYPE_KEY, typeId);
  } catch {
    // Not critical: the revision then starts on the type screen.
  }
}

export async function loadBusinessType(): Promise<BusinessTypeId | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(TYPE_KEY);
    return BUSINESS_TYPE_IDS.find((id) => id === raw) ?? null;
  } catch {
    return null;
  }
}

/** Forgets everything onboarding remembers on this device (sign-out, or onboarding finished). */
export async function clearOnboardingStorage(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all(
    [KEY, TYPE_KEY].map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => undefined),
    ),
  );
}
