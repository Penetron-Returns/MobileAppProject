import { Linking, PermissionsAndroid } from 'react-native';

/**
 * Asks for the microphone and (Android 13+) notifications "Hey Clovie" needs.
 * Returns whether both are granted. Notifications are required because the
 * foreground service's "Clovie is listening" notice and the Stop action are
 * how the owner sees and ends listening.
 */
export async function requestVoicePermissions(): Promise<boolean> {
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  ]);
  return Object.values(result).every(
    (value) => value === PermissionsAndroid.RESULTS.GRANTED,
  );
}

/**
 * Opens Android's battery-optimisation list so the owner can let Clovie run in the background. This is
 * the settings screen, not the direct REQUEST_IGNORE_BATTERY_OPTIMIZATIONS prompt, which Google Play
 * restricts and which Clovie therefore does not declare. Falls back to Clovie's own app settings.
 */
export async function openBatterySettings(): Promise<void> {
  try {
    await Linking.sendIntent(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
  } catch {
    await Linking.openSettings();
  }
}
