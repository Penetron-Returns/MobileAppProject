import { Group, GroupRow, Page, Skeleton, Switch, Text } from '@booking/ui';
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

/** The last permission and opt-out read, so a revisit starts on the real state. */
let lastKnown: { permission: PushPermission; optedOut: boolean } | null = null;

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
  // Seeded from the last read, so coming back shows the real state at once.
  const [permission, setPermission] = React.useState<PushPermission>(
    lastKnown?.permission ?? 'undetermined',
  );
  const [optedOut, setOptedOut] = React.useState(lastKnown?.optedOut ?? false);
  const [isLoaded, setIsLoaded] = React.useState(lastKnown !== null);
  const isTurningOn = React.useRef(false);
  const isWeb = Platform.OS === 'web';
  const enabled = isPushEnabled(permission, optedOut);

  React.useEffect(() => {
    void (async () => {
      const [granted, out] = await Promise.all([
        getPushPermission(),
        pushStore.isOptedOut(),
      ]);
      lastKnown = { permission: granted, optedOut: out };
      setPermission(granted);
      setOptedOut(out);
      setIsLoaded(true);
    })();
  }, []);

  const turnOn = async () => {
    if (!canReceivePush) {
      toast.info(t('settings.notifications.needsDevice'));
      return;
    }
    if (isTurningOn.current) return;
    isTurningOn.current = true;
    // The switch moves now; it goes back if the permission or token fails.
    const before = { permission, optedOut };
    setOptedOut(false);
    setPermission('granted');
    try {
      if (!(await requestPushPermission())) {
        setPermission('denied');
        setOptedOut(before.optedOut);
        toast.info(t('settings.notifications.denied'));
        return;
      }
      await registerPushToken(await fetchPushToken());
      await pushStore.setOptedOut(false);
      lastKnown = { permission: 'granted', optedOut: false };
    } catch {
      setPermission(before.permission);
      setOptedOut(before.optedOut);
      toast.info(t('settings.notifications.failed'));
    } finally {
      isTurningOn.current = false;
    }
  };

  const turnOff = () => {
    setOptedOut(true);
    lastKnown = { permission, optedOut: true };
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
            isLoaded ? (
              <Switch
                checked={enabled}
                disabled={isWeb}
                onCheckedChange={(on) => (on ? void turnOn() : turnOff())}
                accessibilityLabel={t('settings.notifications.push')}
              />
            ) : (
              <Skeleton className="h-[31px] w-[51px] rounded-full" />
            )
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
