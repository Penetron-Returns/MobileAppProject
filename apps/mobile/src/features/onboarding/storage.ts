import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  initialDraft,
  parseDraft,
  serializeDraft,
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
