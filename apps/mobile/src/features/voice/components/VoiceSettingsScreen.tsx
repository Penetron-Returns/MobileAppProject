import { Button, Group, GroupRow, Page, Switch, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, View } from 'react-native';

import { useHeyClovie } from '../hooks';
import { canTurnOnVoice } from '../status';

/**
 * Settings > Hey Clovie (Android). Off by default. Turning it on asks for the
 * microphone and notifications after saying what the wake word does and does
 * not do with audio, then starts the foreground service.
 */
export function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const voice = useHeyClovie();
  const { state } = voice;
  const phrase = state.wakePhrase || t('voice.title');
  const canToggle = canTurnOnVoice(state.status) && !voice.isPending;

  /** Say what the permissions are for before the system asks. */
  const confirmTurnOn = () =>
    Alert.alert(
      t('voice.permissionRationale.title'),
      [
        t('voice.permissionRationale.microphone'),
        t('voice.permissionRationale.notifications'),
        t('voice.permissionRationale.overlay'),
        t('voice.privacy.body', { phrase }),
      ].join('\n\n'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('voice.permissionRationale.ok'),
          onPress: () => void voice.turnOn(),
        },
      ],
    );

  const statusLine =
    state.status === 'error' && state.error
      ? t(`voice.errors.${state.error}`)
      : t(`voice.status.${state.status}`, { phrase });

  return (
    <Page
      title={t('voice.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
    >
      <Group className="mt-5">
        <GroupRow
          title={t('voice.toggle')}
          subtitle={statusLine}
          trailing={
            <Switch
              checked={voice.isOn}
              disabled={!canToggle}
              onCheckedChange={(on) => (on ? confirmTurnOn() : voice.turnOff())}
              accessibilityLabel={t('voice.toggle')}
            />
          }
        />
      </Group>

      <Group className="mt-3">
        <GroupRow
          title={t('voice.overlay.title')}
          subtitle={
            voice.canOverlay
              ? t('voice.overlay.granted')
              : t('voice.overlay.missing')
          }
          trailing={
            voice.canOverlay ? undefined : (
              <Button
                size="sm"
                variant="secondary"
                onPress={voice.requestOverlay}
              >
                <Text>{t('voice.overlay.allow')}</Text>
              </Button>
            )
          }
        />
      </Group>

      {voice.permissionDenied ? (
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

      <View className="mx-5 mt-6 gap-1">
        <Text
          role="heading"
          aria-level="2"
          className="text-title font-semibold"
        >
          {t('voice.about.title')}
        </Text>
        <Text className="text-subtitle text-muted-foreground">
          {t('voice.about.body', { phrase })}
        </Text>
      </View>
      <View className="mx-5 mt-5 gap-1">
        <Text
          role="heading"
          aria-level="2"
          className="text-title font-semibold"
        >
          {t('voice.privacy.title')}
        </Text>
        <Text className="text-subtitle text-muted-foreground">
          {t('voice.privacy.body', { phrase })}
        </Text>
      </View>
      <Text className="mx-5 mt-5 text-meta text-muted-foreground">
        {t('voice.battery')}
      </Text>
    </Page>
  );
}
