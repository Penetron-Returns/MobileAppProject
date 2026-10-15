import type { AppointmentDTO } from '@booking/types';
import * as React from 'react';

import type { ConflictQuery } from '@/lib/api';
import { toast } from '@/lib/toast';

import { useConflictCheck } from './hooks';

interface Pending {
  conflicts: AppointmentDTO[];
  run: () => void;
}

/**
 * Runs the conflict check before a save that closes time. No conflicts: the
 * save runs. Conflicts: they are held in `pending` for the panel, and the save
 * runs only on `confirm`. Nothing is ever cancelled by the check.
 */
export function useConflictGuard() {
  const check = useConflictCheck();
  const [checking, setChecking] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);

  const guard = React.useCallback(
    async (queries: ConflictQuery[], run: () => void) => {
      setChecking(true);
      try {
        const conflicts = await check(queries);
        if (conflicts.length === 0) run();
        else setPending({ conflicts, run });
      } catch (error) {
        toast.error(error);
      } finally {
        setChecking(false);
      }
    },
    [check],
  );

  const dismiss = React.useCallback(() => setPending(null), []);
  const confirm = React.useCallback(() => {
    const current = pending;
    setPending(null);
    current?.run();
  }, [pending]);

  return { guard, checking, pending, dismiss, confirm };
}
