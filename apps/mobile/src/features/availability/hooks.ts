import type {
  AvailabilityConfigResponse,
  AvailabilityRuleInput,
  CreateSpecialDayRequest,
  CreateStaffTimeOffRequest,
  SpecialDaySuggestionDTO,
  StaffBreakInput,
  UpdateSpecialDayRequest,
} from '@booking/types';
import {
  onlineManager,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import { useBusiness } from '@/features/business/hooks';
import { api, type ConflictQuery } from '@/lib/api';
import { offlineError } from '@/lib/offline';
import { qk, useApiMutation, type MutationCallbacks } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';
import { addDays, todayISO, type ISODate } from '@/lib/time';

import { mergeConflicts, type ConflictNames } from './conflicts';

/** Everything the hours, breaks, time off and calendar screens render, for [from, to]. */
export function useAvailabilityConfig(
  from: ISODate,
  to: ISODate,
  enabled = true,
) {
  return useQuery<AvailabilityConfigResponse>({
    queryKey: qk.availabilityConfigRange(from, to),
    queryFn: () => api.availabilityConfig({ from, to }),
    enabled,
  });
}

/** The next year, from the business's today: what the settings screens call "upcoming". */
export function useUpcomingWindow() {
  const business = useBusiness();
  const tz = business.data?.timezone ?? null;
  return React.useMemo(() => {
    if (!tz) return null;
    const today = todayISO(tz);
    // The API serves at most 366 days inclusive.
    return { today, from: today, to: addDays(today, 365), timezone: tz };
  }, [tz]);
}

/** South African public holidays of the given years (this year and next). */
export function useSpecialDaySuggestions(years: number[], enabled: boolean) {
  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: qk.specialDaySuggestions(year),
      queryFn: () => api.specialDaySuggestions(year),
      enabled,
      staleTime: 5 * 60_000,
    })),
  });
  const suggestions = React.useMemo<SpecialDaySuggestionDTO[]>(
    () => results.flatMap((r) => r.data?.suggestions ?? []),
    [results],
  );
  return {
    suggestions,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

/** What a change to the schedule can alter, so open screens and live slots refresh. */
const SCHEDULE_KEYS = [
  qk.availabilityConfig,
  qk.availabilityDays,
  qk.availabilitySlots,
  ['special-day-suggestions'],
  ['staff-rules'],
  qk.businessHours,
];

export function useSaveSpecialDay(opts: MutationCallbacks = {}) {
  return useApiMutation<{
    id: string | null;
    body: CreateSpecialDayRequest | UpdateSpecialDayRequest;
  }>({
    mutationFn: ({ id, body }, key) =>
      id
        ? api.updateSpecialDay(id, body, key)
        : api.createSpecialDay(body as CreateSpecialDayRequest, key),
    invalidate: SCHEDULE_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

/** Adds several public holidays, one request each (a key per date so a retry replays). */
export function useAddSpecialDays(
  opts: {
    onSuccess?: (count: number) => void;
    onError?: MutationCallbacks['onError'];
  } = {},
) {
  const queryClient = useQueryClient();
  return useApiMutation<CreateSpecialDayRequest[]>({
    mutationFn: async (bodies, key) => {
      try {
        for (const body of bodies) {
          await api.createSpecialDay(body, `${key}:${body.date}`);
        }
      } finally {
        await Promise.all(
          SCHEDULE_KEYS.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      }
    },
    onSuccess: (_data, bodies) => opts.onSuccess?.(bodies.length),
    onError: opts.onError,
  });
}

export function useDeleteSpecialDay(opts: MutationCallbacks = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.deleteSpecialDay(id, key),
    invalidate: SCHEDULE_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useReplaceStaffBreaks(opts: MutationCallbacks = {}) {
  return useApiMutation<{ staffId: string; breaks: StaffBreakInput[] }>({
    mutationFn: ({ staffId, breaks }, key) =>
      api.replaceStaffBreaks(staffId, { breaks }, key),
    invalidate: SCHEDULE_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useReplaceStaffAvailability(opts: MutationCallbacks = {}) {
  return useApiMutation<{ staffId: string; rules: AvailabilityRuleInput[] }>({
    mutationFn: ({ staffId, rules }, key) =>
      api.replaceStaffAvailability(staffId, rules, key),
    invalidate: SCHEDULE_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useSaveTimeOff(opts: MutationCallbacks = {}) {
  return useApiMutation<{
    id: string | null;
    staffId: string;
    body: CreateStaffTimeOffRequest;
  }>({
    mutationFn: ({ id, staffId, body }, key) =>
      id
        ? api.updateTimeOff(id, body, key)
        : api.createTimeOff(staffId, body, key),
    invalidate: SCHEDULE_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useDeleteTimeOff(opts: MutationCallbacks = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.deleteTimeOff(id, key),
    invalidate: SCHEDULE_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

/**
 * Looks up the confirmed bookings a change would strand, one request per
 * query, merged. Always live: a stale answer would hide a booking.
 */
export function useConflictCheck() {
  const queryClient = useQueryClient();
  return React.useCallback(
    async (queries: ConflictQuery[]) => {
      if (!onlineManager.isOnline()) throw offlineError();
      const lists = await Promise.all(
        queries.map((q) =>
          queryClient.fetchQuery({
            queryKey: ['availability-conflicts', q],
            queryFn: async () => (await api.availabilityConflicts(q)).conflicts,
            staleTime: 0,
          }),
        ),
      );
      return mergeConflicts(lists);
    },
    [queryClient],
  );
}

async function fetchConflictNames(ids: string[]) {
  return unwrap(
    await supabase
      .from('appointments')
      .select('id, client:clients(name), service:services(name)')
      .in('id', ids),
  );
}

/** Client and service names of the listed bookings (the conflicts API returns ids only). */
export function useConflictNames(ids: string[]) {
  const key = [...ids].sort().join(',');
  const query = useQuery({
    queryKey: ['availability-conflict-names', key],
    queryFn: () => fetchConflictNames(ids),
    enabled: ids.length > 0,
  });
  return React.useMemo(() => {
    const names = new Map<string, ConflictNames>();
    for (const row of query.data ?? []) {
      names.set(row.id, {
        client: row.client?.name ?? null,
        service: row.service?.name ?? null,
      });
    }
    return names;
  }, [query.data]);
}
