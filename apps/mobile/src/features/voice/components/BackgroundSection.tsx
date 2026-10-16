import { Button, Group, GroupRow, SectionTitle, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { openBatterySettings } from '../permissions';

/**
 * "Let Clovie run in the background": opens the system battery list (no restricted permission) and
 * names Samsung's "Never sleeping apps" path, since phones that sleep apps silence Hey Clovie.
 */
export function BackgroundSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('voice.background.section')}</SectionTitle>
      <Group>
        <GroupRow
          title={t('voice.background.title')}
          subtitle={t('voice.background.hint')}
          trailing={
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void openBatterySettings()}
              accessibilityLabel={t('voice.background.title')}
            >
              <Text>{t('voice.background.action')}</Text>
            </Button>
          }
        />
      </Group>
      <Text className="mx-5 mb-6 mt-2 text-meta text-muted-foreground">
        {t('voice.background.samsung')}
      </Text>
    </>
  );
}
