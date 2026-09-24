import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../shared/database.types.ts';
import type { Env } from '../env.ts';

/**
 * Service-role Supabase client. Bypasses RLS, so it is only ever used
 * server-side and every query MUST be scoped by business_id explicitly.
 */
export type Db = SupabaseClient<Database>;

let cached: Db | undefined;

export function getDb(env: Env): Db {
  if (cached) return cached;
  cached = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'booking-backend' } },
  });
  return cached;
}
