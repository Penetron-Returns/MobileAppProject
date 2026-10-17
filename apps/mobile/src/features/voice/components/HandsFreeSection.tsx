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
import { Alert, Linking, View } from 'react-native';

import { useBusiness } from '@/features/business/hooks';

import { useHeyClovie } from '../hooks';
import { askOverlayAccess } from '../overlayAccess';
import { canTurnOnVoice, handsFreeLine } from '../status';
import { isCloudSttEnabled } from '../transcribe';

/**
 * Opt-in hands-free "Hey Clovie". Off by default. Turning it on asks for the microphone and
 * notifications after saying what it does and does not do with audio; the owner then chooses when
 * it listens (opening hours and/or while charging).
 */
export function HandsFreeSection() {
  const { t } = useTranslation();
  const voice = useHeyClovie();
  const business = useBusiness();
  const { state, handsFree } = voice;
  const phrase = state.wakePhrase || t('voice.hf.toggle');
  const canToggle = canTurnOnVoice(state.status) && !voice.isPending;
  const timezone = business.data?.timezone ?? 'Africa/Johannesburg';

  /** Prominent disclosure (Google Play): what is recorded, when and where it goes, before any permission prompt. */
  const confirmTurnOn = () =>
    Alert.alert(
      t('voice.permissionRationale.title'),
      [
        t('voice.disclosure.what'),
        t('voice.disclosure.recording'),
        t(`voice.disclosure.where.${isCloudSttEnabled ? 'cloud' : 'device'}`),
        t('voice.permissionRationale.notifications'),
        t('voice.permissionRationale.overlay'),
        t('voice.hf.consent'),
      ].join('\n\n'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('voice.permissionRationale.ok'),
          onPress: () => void voice.turnOn(),
        },
      ],
    );

  const line = handsFreeLine(handsFree, Date.now(), timezone);
  const statusLine =
    state.status === 'error' && state.error
      ? t(`voice.errors.${state.error}`)
      : state.status === 'not_configured'
        ? t('voice.status.not_configured')
        : t(`voice.hf.status.${line.key}`, { time: line.time });

  return (
    <>
      <SectionTitle>{t('voice.hf.section')}</SectionTitle>
      <Text className="mx-5 mb-2 text-subtitle text-muted-foreground">
        {t('voice.hf.intro', { phrase })}
      </Text>
      <Group>
        <GroupRow
          title={t('voice.hf.toggle')}
          subtitle={statusLine}
          trailing={
            <Switch
              checked={voice.isOn}
              disabled={!canToggle}
              onCheckedChange={(on) => (on ? confirmTurnOn() : voice.turnOff())}
              accessibilityLabel={t('voice.hf.toggle')}
            />
          }
        />
      </Group>

      <SectionTitle>{t('voice.hf.conditions')}</SectionTitle>
      <Group>
        <GroupRow
          disabled={!voice.isOn}
          reason={t('voice.hf.conditionsOff')}
          title={t('voice.hf.hours.title')}
          subtitle={t('voice.hf.hours.hint')}
          trailing={
            <Switch
              checked={handsFree.useOpeningHours}
              disabled={!voice.isOn}
              onCheckedChange={(on) =>
                voice.setConditions({ useOpeningHours: on })
              }
              accessibilityLabel={t('voice.hf.hours.title')}
            />
          }
        />
        <GroupRow
          showSeparator
          disabled={!voice.isOn}
          reason={t('voice.hf.conditionsOff')}
          title={t('voice.hf.charging.title')}
          subtitle={t('voice.hf.charging.hint')}
          trailing={
            <Switch
              checked={handsFree.onlyWhileCharging}
              disabled={!voice.isOn}
              onCheckedChange={(on) =>
                voice.setConditions({ onlyWhileCharging: on })
              }
              accessibilityLabel={t('voice.hf.charging.title')}
            />
          }
        />
      </Group>

      <Group className="mt-5">
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
                onPress={() => void askOverlayAccess(t)}
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

      <Text className="mx-5 mt-3 text-meta text-muted-foreground">
        {t('voice.hf.consent')}
      </Text>
      <Text className="mx-5 mb-6 mt-2 text-meta text-muted-foreground">
        {t('voice.battery')}
      </Text>
    </>
  );
}
