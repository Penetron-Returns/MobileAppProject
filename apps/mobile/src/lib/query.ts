import {
  QueryClient,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { isApiError } from './api';
import { IdempotencyTracker } from './idempotency';
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

/** Central query keys so Realtime can invalidate precisely. */
export const qk = {
  me: ['me'] as const,
  business: ['business'] as const,
  dashboardAll: ['dashboard'] as const,
  dashboard: (date: string) => ['dashboard', date] as const,
  appointments: ['appointments'] as const,
  appointmentsRange: (from: string, to: string, staffId?: string | null) =>
    ['appointments', 'range', from, to, staffId ?? 'all'] as const,
  appointment: (id: string) => ['appointments', 'one', id] as const,
  clientAppointments: (clientId: string) =>
    ['appointments', 'client', clientId] as const,
  clients: ['clients'] as const,
  clientList: (filter: string, search: string) =>
    ['clients', 'list', filter, search] as const,
  clientSearch: (q: string) => ['clients', 'search', q] as const,
  client: (id: string) => ['clients', 'one', id] as const,
  clientNotes: (id: string) => ['clients', 'notes', id] as const,
  services: ['services'] as const,
  staff: ['staff'] as const,
  staffServices: ['staff-services'] as const,
  staffRules: (id: string) => ['staff-rules', id] as const,
  overrides: (staffId: string | null) =>
    ['overrides', staffId ?? 'business'] as const,
  businessHours: ['business-hours'] as const,
  availabilityDays: ['availability', 'days'] as const,
  availabilitySlots: ['availability', 'slots'] as const,
  whatsapp: ['whatsapp'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', 'one', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  openEscalations: ['escalations', 'open-count'] as const,
};

interface ApiMutationOptions<TVars, TData> {
  mutationFn: (vars: TVars, idempotencyKey: string) => Promise<TData>;
  /** Query keys to invalidate after success. */
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
  /** Return true to suppress the default error toast. */
  onError?: (error: unknown, vars: TVars) => boolean | void;
  successMessage?: string;
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

  const m = useMutation<TData, unknown, { vars: TVars; key: string }>({
    mutationFn: ({ vars, key }) => optsRef.current.mutationFn(vars, key),
    retry: (count, err) => count < 2 && isApiError(err) && err.isRetryable,
    retryDelay: (attempt) => 600 * (attempt + 1),
    onSuccess: async (data, { vars }) => {
      tracker.current.settle();
      const o = optsRef.current;
      await Promise.all(
        (o.invalidate ?? []).map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
      if (o.successMessage) toast.success(o.successMessage);
      o.onSuccess?.(data, vars);
    },
    onError: (error, { vars }) => {
      tracker.current.settle(error);
      const handled = optsRef.current.onError?.(error, vars);
      if (!handled) toast.error(error);
    },
  });

  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = m;
  const mutate = useCallback(
    (vars: TVars) => {
      rawMutate({ vars, key: tracker.current.keyFor(vars) });
    },
    [rawMutate],
  );
  const mutateAsync = useCallback(
    (vars: TVars) =>
      rawMutateAsync({ vars, key: tracker.current.keyFor(vars) }),
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
