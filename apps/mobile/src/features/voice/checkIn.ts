/** Appointments that have started or start within this long can be checked in by voice. */
export const CHECK_IN_LEAD_MS = 15 * 60_000;

/** What picking a client to check in needs from an appointment. */
export interface CheckInCandidate {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  checked_in_at: string | null;
  client: { name: string | null } | null;
}

export type CheckInPick<T extends CheckInCandidate> =
  | { kind: 'match'; appointment: T }
  | { kind: 'none'; reason: 'no_appointment' | 'no_name_match' };

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** True when `a` and `b` differ by at most one inserted, removed or changed letter. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  return (
    a.slice(i + 1) === b.slice(i + 1) || // one letter changed
    a.slice(i + 1) === b.slice(i) || // one letter extra in a
    a.slice(i) === b.slice(i + 1) // one letter extra in b
  );
}

/**
 * Speech recognition mangles names ("Thandi" becomes "Tandi"), so a spoken
 * word matches a name word when it is the same, starts it (a short form of a
 * longer name) or is one letter off for words of 4+ letters.
 */
function wordMatches(spoken: string, known: string): boolean {
  if (spoken === known) return true;
  if (spoken.length >= 3 && known.startsWith(spoken)) return true;
  return (
    spoken.length >= 4 && known.length >= 4 && withinOneEdit(spoken, known)
  );
}

/** Whether every word the owner said matches some word of the client's name. */
export function nameMatches(
  spoken: string,
  clientName: string | null,
): boolean {
  if (!clientName) return false;
  const known = fold(clientName);
  const words = fold(spoken);
  return (
    words.length > 0 && words.every((w) => known.some((k) => wordMatches(w, k)))
  );
}

/**
 * The appointment "client has arrived" refers to: confirmed, not checked in,
 * started (and not finished) or starting within 15 minutes, nearest to `now`
 * first (ties by id). When a name was said only a client matching it is
 * picked: checking in the wrong person is worse than asking again. Pure:
 * `now` is injected.
 */
export function pickAppointmentToCheckIn<T extends CheckInCandidate>(
  appointments: readonly T[],
  options: { now: Date; name?: string },
): CheckInPick<T> {
  const now = options.now.getTime();
  const open = appointments.filter((a) => {
    const start = Date.parse(a.starts_at);
    const end = Date.parse(a.ends_at);
    return (
      a.status === 'confirmed' &&
      !a.checked_in_at &&
      start <= now + CHECK_IN_LEAD_MS &&
      end > now
    );
  });
  const spoken = options.name;
  const named = spoken
    ? open.filter((a) => nameMatches(spoken, a.client?.name ?? null))
    : open;
  const [best] = [...named].sort(
    (a, b) =>
      Math.abs(Date.parse(a.starts_at) - now) -
        Math.abs(Date.parse(b.starts_at) - now) || a.id.localeCompare(b.id),
  );
  if (best) return { kind: 'match', appointment: best };
  return {
    kind: 'none',
    reason: spoken && open.length > 0 ? 'no_name_match' : 'no_appointment',
  };
}
