import { Linking } from 'react-native';

/** Where the legal pages live. The one place to change when the URLs move. */
export const LEGAL_URLS = {
  terms: 'https://getclovie.app/terms',
  privacy: 'https://getclovie.app/privacy',
  deleteAccount: 'https://getclovie.app/delete-account',
} as const;

export type LegalPage = keyof typeof LEGAL_URLS;

/** Opens a legal page in the system browser. Resolves false when it could not be opened. */
export async function openLegalPage(page: LegalPage): Promise<boolean> {
  try {
    await Linking.openURL(LEGAL_URLS[page]);
    return true;
  } catch {
    return false;
  }
}
