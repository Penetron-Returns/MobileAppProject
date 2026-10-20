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

let signedInProbe: () => boolean = () => false;

/** Lets the data layer ask whether Clerk currently reports a signed-in user. */
export function setSignedInProbe(fn: () => boolean) {
  signedInProbe = fn;
}

export const TOKEN_WAIT_MS = 8000;
const TOKEN_POLL_FIRST_MS = 100;
const TOKEN_POLL_MAX_MS = 800;

export interface WaitForTokenDeps {
  getToken: TokenGetter;
  /** True while Clerk reports a signed-in user; a signed-out user never waits. */
  isSignedIn: () => boolean;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/**
 * Right after sign-in Clerk reports signed in a moment before it can mint a
 * token. Poll with short backoff for a bounded time instead of failing the first
 * request; null if still none, or if the user is (or becomes) signed out.
 */
export async function waitForToken(
  deps: WaitForTokenDeps,
): Promise<string | null> {
  const deadline = deps.now() + (deps.timeoutMs ?? TOKEN_WAIT_MS);
  let delay = TOKEN_POLL_FIRST_MS;
  for (;;) {
    const token = await deps.getToken().catch(() => null);
    if (token) return token;
    if (!deps.isSignedIn() || deps.now() + delay > deadline) return null;
    await deps.sleep(delay);
    delay = Math.min(delay * 2, TOKEN_POLL_MAX_MS);
  }
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The Clerk session token for a call, waiting briefly right after sign-in; null if there is none. */
export function getSessionToken(): Promise<string | null> {
  return waitForToken({
    getToken: getAuthToken,
    isSignedIn: signedInProbe,
    now: Date.now,
    sleep: realSleep,
  });
}
