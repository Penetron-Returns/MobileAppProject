/**
 * Idempotent organisation creation for onboarding. One user must end up with
 * one organisation however often onboarding retries, remounts or is tapped:
 * an active org or an existing owned one is reused, and concurrent calls for
 * the same user share one create. No React, no Clerk types.
 */

export interface EnsureOrganizationDeps {
  userId: string | null;
  activeOrgId: string | null;
  /** Ids of organisations the user already owns (Clerk's cached list is empty after a fresh sign-in). */
  listOwnedOrgIds: () => Promise<string[]>;
  create: () => Promise<string>;
}

const inFlight = new Map<string, Promise<string>>();

export async function ensureOrganization(
  deps: EnsureOrganizationDeps,
): Promise<string> {
  if (deps.activeOrgId) return deps.activeOrgId;
  const key = deps.userId ?? 'anonymous';
  const running = inFlight.get(key);
  if (running) return running;

  const attempt = (async () => {
    const [existing] = await deps.listOwnedOrgIds();
    return existing ?? (await deps.create());
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, attempt);
  return attempt;
}
