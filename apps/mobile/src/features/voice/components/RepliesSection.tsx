import { Group, GroupRow, SectionTitle, Switch, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useVoiceFeedbackSettings } from '../hooks';

/**
 * How Clovie answers: a soft sound per state and the reply read aloud. Both on by default, because
 * an owner who cannot read the overlay (or has her hands full) must still hear what happened.
 */
export function RepliesSection() {
  const { t } = useTranslation();
  const feedback = useVoiceFeedbackSettings();
  return (
    <>
      <SectionTitle>{t('voice.replies.section')}</SectionTitle>
      <Text className="mx-5 mb-2 text-subtitle text-muted-foreground">
        {t('voice.replies.intro')}
      </Text>
      <Group>
        <GroupRow
          title={t('voice.replies.sounds.title')}
          subtitle={t('voice.replies.sounds.hint')}
          trailing={
            <Switch
              checked={feedback.sounds}
              onCheckedChange={feedback.setSounds}
              accessibilityLabel={t('voice.replies.sounds.title')}
            />
          }
        />
        <GroupRow
          showSeparator
          title={t('voice.replies.readAloud.title')}
          subtitle={t('voice.replies.readAloud.hint')}
          trailing={
            <Switch
              checked={feedback.readAloud}
              onCheckedChange={feedback.setReadAloud}
              accessibilityLabel={t('voice.replies.readAloud.title')}
            />
          }
        />
      </Group>
    </>
  );
}
