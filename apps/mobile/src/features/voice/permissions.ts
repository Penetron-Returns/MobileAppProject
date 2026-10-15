import { PermissionsAndroid } from 'react-native';

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
