import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  BUSINESS_TYPE_IDS,
  initialDraft,
  parseDraft,
  serializeDraft,
  type BusinessTypeId,
  type OnboardingDraft,
} from './logic';

const KEY = 'onboarding.draft.v1';

/** Best effort throughout: a store that fails just means onboarding starts over after a kill. */
export async function loadDraft(): Promise<OnboardingDraft> {
  if (Platform.OS === 'web') return initialDraft();
  try {
    return parseDraft(await SecureStore.getItemAsync(KEY));
  } catch {
    return initialDraft();
  }
}

export async function saveDraft(draft: OnboardingDraft): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(KEY, serializeDraft(draft));
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
