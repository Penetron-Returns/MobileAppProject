import { GLYPHS, Group, GroupRow } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSetupChecklist } from '../useSetupChecklist';

/** The first row of Settings: "Get set up" with how far along. Hidden for staff, while loading and when all is done. */
export function GetSetUpRow() {
  const { t } = useTranslation();
  const checklist = useSetupChecklist();
  if (!checklist.isOwner || !checklist.isReady || checklist.isComplete)
    return null;
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
