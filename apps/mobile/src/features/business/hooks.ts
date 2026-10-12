import type { BusinessHoursRow, UpdateBusinessRequest } from '@shared/api';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import type { MutationCallbacks } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

async function fetchBusiness() {
  // RLS returns only the business of the active Clerk organisation.
  const res = await supabase
    .from('businesses')
    .select('id, name, timezone, currency')
    .single();
  return unwrap<NonNullable<typeof res.data>>(res);
}

export type BusinessSummary = Awaited<ReturnType<typeof fetchBusiness>>;

export function useBusiness() {
  return useQuery({
    queryKey: qk.business,
    queryFn: fetchBusiness,
    staleTime: 5 * 60_000,
  });
}

async function fetchBusinessDetails() {
  const res = await supabase
    .from('businesses')
    .select('id, name, email, phone, address, currency, timezone, logo_url')
    .single();
  return unwrap<NonNullable<typeof res.data>>(res);
}

export type BusinessDetails = Awaited<ReturnType<typeof fetchBusinessDetails>>;

export function useBusinessDetails() {
  return useQuery({
    queryKey: [...qk.business, 'details'],
    queryFn: fetchBusinessDetails,
  });
}

export function useUpdateBusiness(opts: MutationCallbacks = {}) {
  return useApiMutation<UpdateBusinessRequest>({
    mutationFn: (body, key) => api.updateBusiness(body, key),
    invalidate: [qk.business],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

async function fetchBusinessHours() {
  return unwrap(
    await supabase
      .from('business_hours')
      .select('weekday, opens_at, closes_at')
      .order('weekday')
      .order('opens_at'),
  );
}

export function useBusinessHours() {
  return useQuery({
    queryKey: qk.businessHours,
    queryFn: fetchBusinessHours,
    staleTime: 5 * 60_000,
  });
}

export function useReplaceBusinessHours(opts: MutationCallbacks = {}) {
  return useApiMutation<BusinessHoursRow[]>({
    mutationFn: (hours, key) => api.replaceHours({ hours }, key),
    invalidate: [qk.businessHours],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

async function fetchWhatsAppAccount() {
  // Column-scoped select: the token ciphertext is never readable by the app.
  const res = await supabase
    .from('whatsapp_accounts')
    .select('status, display_phone, verified_name')
    .maybeSingle();
  return unwrap<NonNullable<typeof res.data> | null>(res);
}

export function useWhatsAppAccount() {
  return useQuery({ queryKey: qk.whatsapp, queryFn: fetchWhatsAppAccount });
}
