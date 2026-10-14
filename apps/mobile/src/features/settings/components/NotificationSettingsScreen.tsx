import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { Group, GroupRow } from '@/components/Group';
import { Page } from '@/components/Page';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { toast } from '@/lib/toast';

import { useRegisterDevice } from '../hooks';

const STORAGE_KEY = 'pref.pushEnabled';

type DevicePlatform = 'ios' | 'android' | 'web';

/** Asks for permission and returns an Expo push token, or null when the user declines. */
async function obtainPushToken(): Promise<string | null> {
  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as
    string | undefined;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return token.data;
}

/**
 * Settings > Notifications. v1 has one real control: push on this phone
 * (registers an Expo push token with `POST /v1/devices`, which the API uses
 * for new bookings and escalations). Per-event preferences need a schema
 * change, so they are not shown yet.
 */
export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const register = useRegisterDevice();
  const isWeb = Platform.OS === 'web';

  React.useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => setEnabled(v === 'true'))
      .catch(() => undefined);
  }, []);

  const turnOn = async () => {
    if (!Device.isDevice) {
      toast.info(t('settings.notifications.needsDevice'));
      return;
    }
    setBusy(true);
    try {
      const token = await obtainPushToken();
      if (!token) {
        toast.info(t('settings.notifications.denied'));
        return;
      }
      await register.mutateAsync({
        token,
        platform: Platform.OS as DevicePlatform,
      });
      setEnabled(true);
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      toast.info(t('settings.notifications.failed'));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    setEnabled(false);
    AsyncStorage.setItem(STORAGE_KEY, 'false').catch(() => undefined);
  };

  return (
    <Page
      title={t('settings.items.notifications')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
    >
      <Group className="mt-5">
        <GroupRow
          title={t('settings.notifications.push')}
          subtitle={t('settings.notifications.pushHint')}
          trailing={
            <Switch
              checked={enabled}
              disabled={busy || isWeb}
              onCheckedChange={(on) => (on ? void turnOn() : turnOff())}
              accessibilityLabel={t('settings.notifications.push')}
            />
          }
        />
      </Group>
      <Text className="mx-5 mt-3 text-meta text-muted-foreground">
        {isWeb
          ? t('settings.notifications.webUnsupported')
          : t('settings.notifications.footer')}
      </Text>
    </Page>
  );
}
