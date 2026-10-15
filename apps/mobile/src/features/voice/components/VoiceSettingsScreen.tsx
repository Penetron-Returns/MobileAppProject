import { Page } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useVoiceScheduleSync } from '../scheduleSync';
import { HandsFreeSection } from './HandsFreeSection';
import { OneTapSection } from './OneTapSection';

/**
 * Settings > Clovie voice (Android). Two ways to talk to Clovie: one tap (tile, widget, shortcut,
 * side key) with no always-on microphone, and an opt-in hands-free "Hey Clovie".
 */
export function VoiceSettingsScreen() {
  const { t } = useTranslation();
  useVoiceScheduleSync(true);
  return (
    <Page
      title={t('voice.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
    >
      <OneTapSection />
      <HandsFreeSection />
    </Page>
  );
}
