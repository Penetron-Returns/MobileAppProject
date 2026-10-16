import { Group, GroupRow, Page, Switch, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import {
  canReceivePush,
  fetchPushToken,
  getPushPermission,
  registerPushToken,
  requestPushPermission,
  unregisterPushToken,
} from '@/features/notifications/pushDevice';
import {
  isPushEnabled,
  type PushPermission,
} from '@/features/notifications/pushLogic';
import { pushStore } from '@/features/notifications/pushStore';
import { toast } from '@/lib/toast';

/**
 * Settings > Notifications. v1 has one real control: push on this phone
 * (registers an Expo push token with `POST /v1/devices`, which the API uses
 * for new bookings, approvals and attendance questions). The switch shows the real state: OS
 * permission and the owner's own choice. Signing in registers automatically (see
 * `features/notifications`), so this is where to turn it off or back on.. Per-event preferences need a schema
 * change, so they are not shown yet.
 */
export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const [permission, setPermission] =
    React.useState<PushPermission>('undetermined');
  const [optedOut, setOptedOut] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const isWeb = Platform.OS === 'web';
  const enabled = isPushEnabled(permission, optedOut);

  React.useEffect(() => {
    void (async () => {
      setPermission(await getPushPermission());
      setOptedOut(await pushStore.isOptedOut());
    })();
  }, []);

  const turnOn = async () => {
    if (!canReceivePush) {
      toast.info(t('settings.notifications.needsDevice'));
      return;
    }
    setBusy(true);
    try {
      if (!(await requestPushPermission())) {
        setPermission('denied');
        toast.info(t('settings.notifications.denied'));
        return;
      }
      await registerPushToken(await fetchPushToken());
      await pushStore.setOptedOut(false);
      setOptedOut(false);
      setPermission('granted');
    } catch {
      toast.info(t('settings.notifications.failed'));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    setOptedOut(true);
    void pushStore.setOptedOut(true);
    void unregisterPushToken();
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
          subtitle={
            permission === 'denied' && !isWeb
              ? t('settings.notifications.pushOffHint')
              : t('settings.notifications.pushHint')
          }
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
