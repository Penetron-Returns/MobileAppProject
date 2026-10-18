import { queryClient, qk } from '@/lib/query';
import { api } from '@/lib/api';

/** Checkout and billing return links have no screen of their own: the gate shows the right one. */
const RETURN_LINK =
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?(?:checkout|billing)(?:[/?#]|$)/i;

export function isReturnLink(path: string): boolean {
  return RETURN_LINK.test(path);
}

/**
 * Rewrites `<scheme>://checkout/*` and `<scheme>://billing/*` to `/` when they
 * arrive outside an auth session (the app was killed, or the browser handed
 * the link to the system), so they never hit +not-found. A paid plan is
 * noticed by refreshing `/v1/me`, which the gate routes from.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  if (!isReturnLink(path)) return path;
  void queryClient
    .fetchQuery({ queryKey: qk.me, queryFn: api.me, staleTime: 0 })
    .catch(() => undefined);
  return '/';
}
