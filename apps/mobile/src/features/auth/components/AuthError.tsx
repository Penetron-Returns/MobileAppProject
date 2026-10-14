import { Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthErrorKey } from '../errors';

/** Plain-language error line; announced to screen readers when it appears. */
export function AuthError({ errorKey }: { errorKey: AuthErrorKey | null }) {
  const { t } = useTranslation();
  if (!errorKey) return null;
  return (
    <Text
      role="alert"
      accessibilityLiveRegion="assertive"
      className="text-center text-subtitle text-destructive"
    >
      {t(`auth.errors.${errorKey}`)}
    </Text>
  );
}
