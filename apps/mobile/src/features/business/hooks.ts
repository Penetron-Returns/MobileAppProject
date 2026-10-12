import { useQuery } from '@tanstack/react-query';

import { qk } from '@/lib/query';
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
