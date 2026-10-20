import { ConfirmDialog } from '@booking/ui';
import { useTranslation } from 'react-i18next';

import { usePushRegistration } from '../usePushRegistration';

/** Mounted once inside the signed-in app: registers the phone for push and shows the one-time primer. */
export function PushRegistration({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const { primerOpen, accept, decline } = usePushRegistration(enabled);
  return (
    <ConfirmDialog
      open={primerOpen}
      onOpenChange={(open) => {
        if (!open) decline();
      }}
      title={t('notifications.primer.title')}
      description={t('notifications.primer.body')}
      confirmLabel={t('notifications.primer.accept')}
      cancelLabel={t('notifications.primer.decline')}
      onConfirm={() => void accept()}
    />
  );
}
