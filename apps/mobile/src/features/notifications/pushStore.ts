import AsyncStorage from '@react-native-async-storage/async-storage';

/** `pref.pushEnabled` is shared with Settings > Notifications ('false' = the owner switched it off). */
const ENABLED_KEY = 'pref.pushEnabled';
const PRIMER_KEY = 'pref.pushPrimerSeen';
const TOKEN_KEY = 'pref.pushToken';

async function read(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // Preferences are a convenience; losing one only means asking again.
  }
}

export const pushStore = {
  isOptedOut: async () => (await read(ENABLED_KEY)) === 'false',
  setOptedOut: (optedOut: boolean) =>
    write(ENABLED_KEY, optedOut ? 'false' : 'true'),
  isPrimerSeen: async () => (await read(PRIMER_KEY)) === 'true',
  markPrimerSeen: () => write(PRIMER_KEY, 'true'),
  getToken: () => read(TOKEN_KEY),
  setToken: (token: string | null) => write(TOKEN_KEY, token),
};
