import { CenteredSpinner } from '@booking/ui';
import { Redirect } from 'expo-router';
import * as React from 'react';

import { useCanManage, useMe } from '../me';

/**
 * Wraps an owner-only settings screen: a staff login is sent back to Settings
 * instead of seeing screens the API would refuse anyway. The API still
 * enforces the role (`requireOwner`); this is the front door, not the lock.
 */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const canManage = useCanManage();
  if (!canManage) return <Redirect href="/settings" />;
  if (me.isPending) return <CenteredSpinner />;
  return <>{children}</>;
}
