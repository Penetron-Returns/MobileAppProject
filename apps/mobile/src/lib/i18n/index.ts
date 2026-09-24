import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from './locales/en-US.json';

/**
 * English only for now (pt-BR from the boilerplate was dropped; see
 * docs/mobile-app.md). Initialised synchronously at import time so the
 * first render already has strings.
 */
export const resources = {
  'en-US': { translation: enUS },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources,
    lng: 'en-US',
    fallbackLng: 'en-US',
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
