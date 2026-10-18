import { GLYPHS, Group, GroupRow } from '@booking/ui';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSetupChecklist } from '../useSetupChecklist';

/** A one-line row (60pt, see GroupRow) as the placeholder while loading. */
const RESERVED_HEIGHT = 60;

/** The first row of Settings: "Get set up" with how far along. Hidden for staff, while loading and when all is done. */
export function GetSetUpRow() {
  const { t } = useTranslation();
  const checklist = useSetupChecklist();
  if (!checklist.isOwner || checklist.isComplete) return null;
  // Hold the row's place while the checklist loads so what is below does not jump.
  if (!checklist.isReady) {
    return <View style={{ height: RESERVED_HEIGHT, marginTop: 16 }} />;
  }
  return (
    <Group radius={26} className="mt-4">
      <GroupRow
        icon={GLYPHS.sliders}
        title={t('checklist.title')}
        subtitle={
          checklist.items.some((i) => i.id === 'whatsapp' && !i.isDone)
            ? t('checklist.whatsapp.first')
            : undefined
        }
        detail={t('checklist.progress', {
          done: checklist.doneCount,
          total: checklist.items.length,
        })}
        onPress={() => router.push('/settings/get-set-up' as never)}
      />
    </Group>
  );
}
