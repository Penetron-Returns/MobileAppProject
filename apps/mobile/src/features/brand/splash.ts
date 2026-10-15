import * as SplashScreen from 'expo-splash-screen';

let hidden = false;

/** Keeps the native splash up until something has drawn a first frame. Call once, at module load. */
export function holdNativeSplash(): void {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

/** Hides the native splash. Idempotent, and never throws (a hidden splash is the goal). */
export function hideNativeSplash(): void {
  if (hidden) return;
  hidden = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

/** Test hook: lets a suite observe the hide again. */
export function resetNativeSplashForTests(): void {
  hidden = false;
}
