import {
  onlineManager,
  QueryClient,
  useMutation,
  useQueryClient,
  type QueryClient as QueryClientType,
  type QueryFilters,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { isApiError } from './api';
import { IdempotencyTracker } from './idempotency';
import { offlineError } from './offline';
import { noteMutationSettled, noteMutationStart } from './ownMutations';
import { applyPersistedGcTimes } from './queryPersist';
import { toast } from './toast';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500)
          return false;
        return count < 2;
      },
    },
  },
});

applyPersistedGcTimes(queryClient);

/** Central query keys so Realtime can invalidate precisely. */
export const qk = {
  me: ['me'] as const,
  business: ['business'] as const,
  appointments: ['appointments'] as const,
  appointmentsRange: (from: string, to: string, staffId?: string | null) =>
    ['appointments', 'range', from, to, staffId ?? 'all'] as const,
  /** The dashboard summary RPC; under `appointments` so Realtime refreshes it. */
  dashboard: (date: string) => ['appointments', 'dashboard', date] as const,
  appointment: (id: string) => ['appointments', 'one', id] as const,
  clientAppointments: (clientId: string) =>
    ['appointments', 'client', clientId] as const,
  clients: ['clients'] as const,
  clientBook: ['clients', 'book'] as const,
  clientSearch: (q: string) => ['clients', 'search', q] as const,
  client: (id: string) => ['clients', 'one', id] as const,
  clientNotes: (id: string) => ['clients', 'notes', id] as const,
  services: ['services'] as const,
  staff: ['staff'] as const,
  staffServices: ['staff-services'] as const,
  team: ['team'] as const,
  staffRules: (id: string) => ['staff-rules', id] as const,
  overrides: (staffId: string | null) =>
    ['overrides', staffId ?? 'business'] as const,
  businessHours: ['business-hours'] as const,
  availabilityConfig: ['availability-config'] as const,
  availabilityConfigRange: (from: string, to: string) =>
    ['availability-config', from, to] as const,
  specialDaySuggestions: (year: number) =>
    ['special-day-suggestions', year] as const,
  availabilityDays: ['availability', 'days'] as const,
  availabilitySlots: ['availability', 'slots'] as const,
  whatsapp: ['whatsapp'] as const,
  whatsappChannel: ['whatsapp', 'channel'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', 'one', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  /** Appointments (and the clients created in the window) behind the Reports screen; under `appointments` so Realtime refreshes them. */
  reportRows: (from: string, to: string) =>
    ['appointments', 'report', from, to] as const,
  attendance: ['attendance'] as const,
  accountDeletionPreview: ['account', 'deletion-preview'] as const,
  openEscalations: ['escalations', 'open-count'] as const,
};

/** Optional callbacks feature mutation hooks accept from their callers. */
export interface MutationCallbacks {
  onSuccess?: () => void;
  /** Return true to suppress the default error toast. */
  onError?: (error: unknown) => boolean | void;
}

/** Rolls an optimistic cache patch back. */
export type Rollback = () => void;

/**
 * Patches every cached query matching `filters` with `updater` (skipping
 * queries with no data yet) and returns a function that restores the exact
 * previous values. Cancels in-flight fetches first so they can't overwrite it.
 */
export function patchQueries<T = unknown>(
  qc: QueryClientType,
  filters: QueryFilters,
  updater: (old: T) => T,
): Rollback {
  void qc.cancelQueries(filters);
  const snapshots = qc
    .getQueriesData<T>(filters)
    .filter(([, data]) => data !== undefined);
  for (const [key, data] of snapshots) {
    qc.setQueryData<T>(key, updater(data as T));
  }
  return () => {
    for (const [key, data] of snapshots) qc.setQueryData<T>(key, data);
  };
}

interface ApiMutationOptions<TVars, TData> {
  mutationFn: (vars: TVars, idempotencyKey: string) => Promise<TData>;
  /** Query keys to invalidate after success. */
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
  /** Return true to suppress the default error toast. */
  onError?: (error: unknown, vars: TVars) => boolean | void;
  successMessage?: string;
  /**
   * Runs before the request: patch the cache (use `patchQueries`) and return
   * the rollback. The rollback runs on error; invalidation runs either way.
   */
  optimistic?: (vars: TVars, qc: QueryClientType) => Rollback | void;
}

/**
 * Wraps a write in TanStack's useMutation with one Idempotency-Key per user
 * action (reused by automatic and manual retries of the same payload), and
 * a default error toast that carries the API request_id.
 */
export function useApiMutation<TVars, TData = unknown>(
  opts: ApiMutationOptions<TVars, TData>,
) {
  const qc = useQueryClient();
  const tracker = useRef(new IdempotencyTracker());
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const m = useMutation<
    TData,
    unknown,
    { vars: TVars; key: string },
    { rollback: Rollback | null }
  >({
    mutationFn: ({ vars, key }) => optsRef.current.mutationFn(vars, key),
    // Offline writes are refused up front (see `mutate`), so a request that was
    // in flight when the connection dropped fails instead of waiting forever.
    networkMode: 'always',
    retry: (count, err) => count < 2 && isApiError(err) && err.isRetryable,
    retryDelay: (attempt) => 600 * (attempt + 1),
    onMutate: ({ vars }) => {
      noteMutationStart();
      const rollback = optsRef.current.optimistic?.(vars, qc);
      return { rollback: rollback ?? null };
    },
    onSuccess: (data, { vars }) => {
      tracker.current.settle();
      const o = optsRef.current;
      if (o.successMessage) toast.success(o.successMessage);
      o.onSuccess?.(data, vars);
    },
    onError: (error, { vars }, ctx) => {
      ctx?.rollback?.();
      tracker.current.settle(error);
      const handled = optsRef.current.onError?.(error, vars);
      if (!handled) toast.error(error);
    },
    // Fire-and-forget: the UI never waits on the refetch round trip.
    onSettled: (_data, error, _vars, ctx) => {
      noteMutationSettled();
      if (error && !ctx?.rollback) return;
      for (const queryKey of optsRef.current.invalidate ?? []) {
        void qc.invalidateQueries({ queryKey });
      }
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = m;
  const mutate = useCallback(
    (vars: TVars) => {
      // Writes are never queued offline: a booking must be checked live.
      if (!onlineManager.isOnline()) {
        toast.error(offlineError());
        return;
      }
      rawMutate({ vars, key: tracker.current.keyFor(vars) });
    },
    [rawMutate],
  );
  const mutateAsync = useCallback(
    (vars: TVars) => {
      if (!onlineManager.isOnline()) return Promise.reject(offlineError());
      return rawMutateAsync({ vars, key: tracker.current.keyFor(vars) });
    },
    [rawMutateAsync],
  );

  return {
    mutate,
    mutateAsync,
    isPending: m.isPending,
    error: m.error,
    reset: m.reset,
  };
}
