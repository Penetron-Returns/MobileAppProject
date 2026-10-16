import type { AttendanceMode } from '@booking/types';
import { Capsule, Group, GroupRow, Page, Text, useDepth } from '@booking/ui';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCanManage, useMe } from '@/features/business/me';

import { useSetAttendanceMode } from '../hooks';

const OPTIONS: readonly AttendanceMode[] = ['staff', 'owner'];

/** Settings > Who confirms attendance. Owners choose; staff only get the owner-only note. */
export function AttendanceModeScreen() {
  const { t } = useTranslation();
  const depth = useDepth();
  const me = useMe();
  const canManage = useCanManage();
  const setMode = useSetAttendanceMode();
  const current = me.data?.business.attendance_mode;

  return (
    <Page
      title={t('attendance.setting.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
    >
      {!canManage ? (
        <Text className="mx-5 mt-5 text-title text-muted-foreground">
          {t('settings.ownerOnly')}
        </Text>
      ) : (
        <>
          <Text className="mx-5 mt-2 text-title text-muted-foreground">
            {t('attendance.setting.hint')}
          </Text>
          <Group className="mt-5" radius={22} role="radiogroup">
            {OPTIONS.map((mode, i) => {
              const title = t(`attendance.setting.${mode}`);
              const selected = current === mode;
              return (
                <GroupRow
                  key={mode}
                  showSeparator={i > 0}
                  title={title}
                  subtitle={t(`attendance.setting.${mode}Detail`)}
                  accessibilityLabel={
                    selected
                      ? t('attendance.setting.selected', { label: title })
                      : title
                  }
                  onPress={() => {
                    if (!selected) setMode.mutate(mode);
                  }}
                  trailing={
                    <View className="flex-row items-center gap-2">
                      {mode === 'staff' ? (
                        <Capsule
                          tone="green"
                          label={t('attendance.setting.recommended')}
                        />
                      ) : null}
                      {selected ? (
                        <Check
                          size={18}
                          strokeWidth={2.6}
                          color={depth.colors.tint}
                        />
                      ) : null}
                    </View>
                  }
                />
              );
            })}
          </Group>
        </>
      )}
    </Page>
  );
}
