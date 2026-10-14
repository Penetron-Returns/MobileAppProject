import * as React from 'react';

/**
 * Gate for actions that must be checked live. Offline, `guard` opens the
 * blocked-action sheet instead of running the action.
 *
 *   const { guard, sheetProps } = useOfflineGuard(isOffline, refetch);
 *   <Button onPress={guard(() => router.push('/add'))} />
 *   <BlockedActionSheet {...sheetProps} />
 */
export function useOfflineGuard(
  isOffline: boolean,
  recheck?: () => Promise<unknown>,
) {
  const [open, setOpen] = React.useState(false);

  const guard = React.useCallback(
    (action: () => void) => () => {
      if (isOffline) setOpen(true);
      else action();
    },
    [isOffline],
  );

  return {
    guard,
    sheetProps: { open, onOpenChange: setOpen, onTryAgain: recheck },
  };
}
