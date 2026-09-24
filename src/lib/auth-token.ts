/**
 * Bridge between Clerk (a React hook) and the non-React data layer.
 * `<AuthTokenBridge />` registers Clerk's `getToken` here once the provider
 * mounts, and both the Supabase client and the API client read from it.
 */
export type TokenGetter = () => Promise<string | null>;

let getter: TokenGetter = async () => null;

export function setAuthTokenGetter(fn: TokenGetter) {
  getter = fn;
}

export function getAuthToken(): Promise<string | null> {
  return getter();
}
