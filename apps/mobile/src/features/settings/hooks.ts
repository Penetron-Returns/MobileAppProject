import type { BookingRules } from '@booking/types';
import { useQuery } from '@tanstack/react-query';

import { useUpdateBusiness } from '@/features/business/hooks';
import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

import { parseRules } from './rules';

async function fetchBookingRules() {
  const res = await supabase
    .from('businesses')
    .select('booking_rules')
    .single();
  return parseRules(unwrap<NonNullable<typeof res.data>>(res).booking_rules);
}

export function useBookingRules() {
  return useQuery({
    queryKey: [...qk.business, 'rules'],
    queryFn: fetchBookingRules,
  });
}

/** Saves one or more rules; the API merges `booking_rules` partially. */
export function useSaveBookingRules() {
  return useUpdateBusiness();
}

export type RulePatch = Partial<BookingRules>;

/** Channel status, flows and templates from the API (gated by `whatsapp_menu`). */
export function useWhatsAppChannel() {
  return useQuery({
    queryKey: [...qk.whatsapp, 'channel'],
    queryFn: api.whatsapp,
  });
}

export function useWhatsAppAction(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<'sync' | 'pause' | 'resume' | 'disconnect'>({
    mutationFn: (action, key) => api.whatsappAction(action, key),
    invalidate: [qk.whatsapp],
    onSuccess: opts.onSuccess,
  });
}

export function useSendTestMessage(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<string>({
    mutationFn: (to, key) => api.whatsappTestMessage({ to }, key),
    onSuccess: opts.onSuccess,
  });
}

export function useRegisterDevice() {
  return useApiMutation<{ token: string; platform: 'ios' | 'android' | 'web' }>(
    {
      mutationFn: (body, key) => api.registerDevice(body, key),
    },
  );
}
