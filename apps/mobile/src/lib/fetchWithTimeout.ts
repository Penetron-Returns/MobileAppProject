/** How long a request may take to get its response headers before it is abandoned. */
export const FETCH_TIMEOUT_MS = 15_000;

/** The request outlived its timeout (distinct from the caller cancelling it). */
export class FetchTimeoutError extends Error {
  constructor() {
    super('The request timed out.');
    this.name = 'FetchTimeoutError';
  }
}

/**
 * `fetch` with a deadline, so a dead connection fails in seconds instead of
 * hanging until the OS gives up. A caller-supplied `signal` still cancels the
 * request (and surfaces as the usual AbortError).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const outer = init.signal;
  const forwardAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener('abort', forwardAbort, { once: true });
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new FetchTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forwardAbort);
  }
}
