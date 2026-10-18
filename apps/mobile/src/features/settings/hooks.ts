import type { BookingRules, UpdateBusinessRequest } from '@booking/types';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { patchQueries, qk, useApiMutation } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

import { parseRules } from './rules';

async function fetchBookingRules() {
  const res = await supabase
    .from('businesses')
    .select('booking_rules')
    .single();
  return parseRules(unwrap<NonNullable<typeof res.data>>(res).booking_rules);
}

/** Everything derived from the opening hours: calendar window, bookable days and slots. */
const SCHEDULE_KEYS = [
  qk.availabilityConfig,
  qk.availabilityDays,
  qk.availabilitySlots,
  qk.businessHours,
];

/** Refetches what the schedule drives, so the calendar and pickers follow a change. */
export function invalidateSchedule(qc: QueryClient) {
  for (const queryKey of SCHEDULE_KEYS) void qc.invalidateQueries({ queryKey });
}

const RULES_KEY = [...qk.business, 'rules'] as const;

export function useBookingRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: fetchBookingRules,
  });
}

/**
 * Saves one or more rules; the API merges `booking_rules` partially. The new
 * value shows at once and goes back if the save fails.
 */
export function useSaveBookingRules() {
  return useApiMutation<UpdateBusinessRequest>({
    mutationFn: (body, key) => api.updateBusiness(body, key),
    // Lead time, slot interval and buffer change which days and slots exist.
    invalidate: [qk.business, qk.availabilityDays, qk.availabilitySlots],
    optimistic: (body, qc) =>
      patchQueries<BookingRules>(
        qc,
        { queryKey: RULES_KEY, exact: true },
        (rules) => ({ ...rules, ...body.booking_rules }),
      ),
  });
}

export type RulePatch = Partial<BookingRules>;

export function useRegisterDevice() {
  return useApiMutation<{ token: string; platform: 'ios' | 'android' | 'web' }>(
    {
      mutationFn: (body, key) => api.registerDevice(body, key),
    },
  );
}
