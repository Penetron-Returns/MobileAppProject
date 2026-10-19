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

/**
 * The scoped device voice token: a long-lived credential for the two calls that must work with no live
 * Clerk session (the voice clip upload and the attendance answer). It is never used anywhere else, and
 * the server refuses it on every other route.
 */
export interface DeviceTokenSource {
  get(): Promise<string | null>;
  /** The server answered 401 to this token: forget it so the app mints a new one. */
  onRejected(): void;
}

let deviceSource: DeviceTokenSource | null = null;

export function setDeviceTokenSource(source: DeviceTokenSource | null) {
  deviceSource = source;
}

// Mirrors the API's device-token scope (apps/api/src/middleware/deviceToken.ts).
const DEVICE_TOKEN_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/v1\/voice\/transcriptions$/ },
  { method: 'POST', path: /^\/v1\/attendance\/[^/]+\/answer$/ },
  { method: 'POST', path: /^\/v1\/appointments\/[^/]+\/check-in$/ },
  { method: 'GET', path: /^\/v1\/voice\/today$/ },
  { method: 'POST', path: /^\/v1\/voice\/ask$/ },
  {
    method: 'POST',
    path: /^\/v1\/voice\/approvals\/[^/]+\/(approve|decline)$/,
  },
  { method: 'POST', path: /^\/v1\/voice\/actions\/[^/]+\/undo$/ },
];

export function acceptsDeviceToken(method: string, path: string): boolean {
  return DEVICE_TOKEN_ROUTES.some(
    (r) => r.method === method && r.path.test(path),
  );
}

export interface BearerCredential {
  token: string;
  isDeviceToken: boolean;
}

/**
 * The bearer for a call: the Clerk session token, or, when `allowDeviceToken` and no session token is
 * available (app backgrounded or killed, so the Clerk getter is missing or fails), the device token.
 * Without `allowDeviceToken` it behaves exactly like `getAuthToken`.
 */
export async function resolveBearer(opts: {
  allowDeviceToken: boolean;
}): Promise<BearerCredential | null> {
  if (!opts.allowDeviceToken) {
    const token = await waitForToken({
      getToken: getAuthToken,
      isSignedIn: signedInProbe,
      now: Date.now,
      sleep: realSleep,
    });
    return token ? { token, isDeviceToken: false } : null;
  }
  const session = await getAuthToken().catch(() => null);
  if (session) return { token: session, isDeviceToken: false };
  const device = await (deviceSource?.get() ?? Promise.resolve(null)).catch(
    () => null,
  );
  return device ? { token: device, isDeviceToken: true } : null;
}

/** Call after the response: a 401 to a device token means it was revoked or replaced. */
export function reportBearerResult(
  credential: BearerCredential,
  status: number,
): void {
  if (credential.isDeviceToken && status === 401) deviceSource?.onRejected();
}
