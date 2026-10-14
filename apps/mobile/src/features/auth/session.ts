/** Pure rules for when the query cache must not outlive the session that filled it. */

export interface SessionScope {
  userId: string | null;
  orgId: string | null;
}

/**
 * True when cached business data belongs to someone else now: the user signed
 * out or changed, or moved from one business to another. Going from signed-out
 * to signed-in (or from no business to the first one) keeps the cache, since
 * nothing of another account can be in it.
 */
export function shouldClearCache(
  previous: SessionScope | null,
  next: SessionScope,
): boolean {
  if (!previous?.userId) return false;
  if (next.userId !== previous.userId) return true;
  return previous.orgId !== null && next.orgId !== previous.orgId;
}
