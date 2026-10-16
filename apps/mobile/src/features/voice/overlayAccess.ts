import { Alert } from 'react-native';

import { requestOverlayPermission } from './clovieVoice';

type Translate = (key: string) => string;

/**
 * Explains "Display over other apps" in the app before Android's settings page opens (Google Play
 * wants the reason first). Resolves once the owner has chosen; `Continue` opens the system page.
 */
export function askOverlayAccess(t: Translate): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(
      t('voice.overlay.explainTitle'),
      t('voice.overlay.hint'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve() },
        {
          text: t('voice.overlay.continue'),
          onPress: () => {
            requestOverlayPermission();
            resolve();
          },
        },
      ],
      { onDismiss: () => resolve() },
    );
  });
}
