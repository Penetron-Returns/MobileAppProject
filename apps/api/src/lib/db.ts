import { createClient } from '@supabase/supabase-js';

import type { Database } from '@booking/database';
import type { Db } from '@booking/features/lib/db.ts';
import type { Env } from '../env.ts';

let cached: Db | undefined;

/** Creates the service-role client once per warm instance. See `Db` for the RLS caveat. */
export function getDb(env: Env): Db {
  if (cached) return cached;
  cached = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'booking-backend' } },
  });
  return cached;
}
