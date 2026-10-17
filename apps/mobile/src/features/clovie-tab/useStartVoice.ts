import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useOpenCompanion } from '@/features/companion/sdk/useOpenCompanion';
import { isSupported, startTalk } from '@/features/voice/clovieVoice';
import { requestVoicePermissions } from '@/features/voice/permissions';
import { toast } from '@/lib/toast';

/**
 * Starts listening for one command (the one-tap path). Where native voice is
 * unavailable it opens the companion chat instead, so the mic never dead-ends.
 */
export function useStartVoice(): () => Promise<void> {
  const { t } = useTranslation();
  const openCompanion = useOpenCompanion();
  return React.useCallback(async () => {
    if (!isSupported()) {
      openCompanion();
      return;
    }
    if (!(await requestVoicePermissions())) {
      toast.info(t('clovieTab.micDenied'));
      return;
    }
    await startTalk();
  }, [openCompanion, t]);
}
