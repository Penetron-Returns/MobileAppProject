import {
  Button,
  Group,
  GroupRow,
  SectionTitle,
  Switch,
  Text,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { useOneTap } from '../oneTap';
import { isCloudSttEnabled } from '../transcribe';

/** The no-always-on way: tile, widget, app-icon shortcut and the side key. */
export function OneTapSection() {
  const { t } = useTranslation();
  const oneTap = useOneTap();
  const tileDone =
    oneTap.tileResult === 'added' || oneTap.tileResult === 'already';

  return (
    <>
      <SectionTitle>{t('voice.oneTap.section')}</SectionTitle>
      <Text className="mx-5 mb-2 text-subtitle text-muted-foreground">
        {t('voice.oneTap.intro')}
      </Text>
      <Group>
        <GroupRow
          title={t('voice.oneTap.tile.title')}
          subtitle={
            oneTap.canPromptForTile
              ? t('voice.oneTap.tile.hint')
              : t('voice.oneTap.tile.hintManual')
          }
          trailing={
            oneTap.canPromptForTile ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={tileDone}
                onPress={() => void oneTap.addTile()}
              >
                <Text>
                  {oneTap.tileResult === 'already'
                    ? t('voice.oneTap.tile.already')
                    : tileDone
                      ? t('voice.oneTap.tile.added')
                      : t('voice.oneTap.tile.add')}
                </Text>
              </Button>
            ) : undefined
          }
        />
        <GroupRow
          showSeparator
          title={t('voice.oneTap.widget.title')}
          subtitle={t('voice.oneTap.widget.hint')}
        />
        <GroupRow
          showSeparator
          title={t('voice.oneTap.shortcut.title')}
          subtitle={t('voice.oneTap.shortcut.hint')}
        />
        <GroupRow
          showSeparator
          title={t('voice.oneTap.sideKey.toggle')}
          subtitle={t('voice.oneTap.sideKey.hint')}
          trailing={
            <Switch
              checked={oneTap.hasLauncherIcon}
              onCheckedChange={oneTap.setLauncherIcon}
              accessibilityLabel={t('voice.oneTap.sideKey.toggle')}
            />
          }
        />
        <GroupRow
          showSeparator
          title={t('voice.oneTap.tryIt.title')}
          subtitle={t('voice.oneTap.tryIt.hint')}
          onPress={() => void oneTap.tryIt()}
        />
      </Group>
      {oneTap.permissionDenied ? (
        <View accessibilityRole="alert" className="mx-5 mt-3 gap-2">
          <Text className="text-meta text-muted-foreground">
            {t('voice.permissionDenied')}
          </Text>
          <Button
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          >
            <Text>{t('voice.openSettings')}</Text>
          </Button>
        </View>
      ) : null}
      <Text className="mx-5 mt-3 text-meta text-muted-foreground">
        {t('voice.oneTap.privacy')}{' '}
        {t(`voice.disclosure.where.${isCloudSttEnabled ? 'cloud' : 'device'}`)}
      </Text>
    </>
  );
}
