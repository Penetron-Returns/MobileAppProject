import type { BookingRules, UpdateBusinessRequest } from '@booking/types';
import { useQuery } from '@tanstack/react-query';

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
    invalidate: [qk.business],
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
