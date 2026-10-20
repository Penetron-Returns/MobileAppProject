import 'react-native-url-polyfill/auto';

import { createClient, type PostgrestError } from '@supabase/supabase-js';

import type { Database } from '@booking/database';

import { getAuthToken } from './auth-token';
import { env } from './env';
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * READ-ONLY data access. RLS scopes every row to the business of the Clerk
 * organisation in the session token (Supabase native third-party auth, so no
 * JWT template). All writes go through `src/lib/api.ts`.
 */
export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://supabase.invalid',
  env.supabaseAnonKey || 'missing-anon-key',
  {
    accessToken: async () => (await getAuthToken()) ?? null,
    // A dead connection fails in seconds (and retries) instead of hanging.
    global: { fetch: (input, init) => fetchWithTimeout(input, init) },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

export class SupabaseReadError extends Error {
  code: string;
  constructor(err: PostgrestError) {
    super(err.message);
    this.name = 'SupabaseReadError';
    this.code = err.code;
  }
}

/** Unwraps a PostgREST response, throwing a typed error on failure. */
export function unwrap<T>(res: {
  data: T | null;
  error: PostgrestError | null;
}): T {
  if (res.error) throw new SupabaseReadError(res.error);
  return res.data as T;
}
