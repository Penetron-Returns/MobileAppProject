import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@booking/database';

/**
 * Service-role Supabase client type. Bypasses RLS, so it is only ever used
 * server-side and every query MUST be scoped by business_id explicitly.
 * The client itself is created in `apps/api/src/lib/db.ts`.
 */
export type Db = SupabaseClient<Database>;
