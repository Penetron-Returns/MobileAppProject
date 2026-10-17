import { Text } from '@booking/ui';
import { useTranslation } from 'react-i18next';

import { useCanManage } from '@/features/business/me';

/**
 * Footer of a screen whose settings only the owner can change. Staff open the
 * screen read-only (nothing is hidden) and see this; owners see nothing.
 */
export function OwnerOnlyNote() {
  const { t } = useTranslation();
  if (useCanManage()) return null;
  return (
    <Text className="mx-5 mt-3 text-meta text-muted-foreground">
      {t('settings.ownerOnly')}
    </Text>
  );
}
