import type { Json } from '@booking/database';

export type InboxView = 'needs' | 'all';

export interface ThreadLike {
  escalations: { status: 'open' | 'resolved' }[];
}

/** A thread needs a reply while one of its escalations is open. */
export function needsReply(thread: ThreadLike): boolean {
  return thread.escalations.some((e) => e.status === 'open');
}

/** Threads for the chosen segment, newest activity first (ties by id). */
export function filterThreads<
  T extends ThreadLike & { id: string; last_message_at: string | null },
>(threads: T[], view: InboxView): T[] {
  const kept = view === 'needs' ? threads.filter(needsReply) : threads;
  return [...kept].sort((a, b) => {
    const at = a.last_message_at ?? '';
    const bt = b.last_message_at ?? '';
    if (at !== bt) return at < bt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}

/** Text of a stored message body (`messages.body` is minimal JSON), or null. */
export function messageText(body: Json): string | null {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const text = body.text;
    if (typeof text === 'string' && text.trim()) return text;
  }
  return null;
}

/** Button titles stored with an interactive bot message. */
export function messageOptions(body: Json): string[] {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const list = body.buttons ?? body.rows;
    if (Array.isArray(list)) {
      return list.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/** Whole hours left to reply for free, or null when the window is closed or unknown. */
export function replyHoursLeft(
  windowExpiresAt: string | null,
  now: Date,
): number | null {
  if (!windowExpiresAt) return null;
  const ms = new Date(windowExpiresAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.floor(ms / 3_600_000));
}

export type Sender = 'customer' | 'bot' | 'staff';

export function senderOf(message: {
  direction: 'in' | 'out';
  sent_by: string | null;
}): Sender {
  if (message.direction === 'in') return 'customer';
  return message.sent_by ? 'staff' : 'bot';
}

export type ThreadItem<M> =
  | { kind: 'message'; message: M }
  | { kind: 'bot-group'; messages: M[]; id: string };

/**
 * Oldest first. Runs of bot messages that precede the first customer
 * message the owner needs to read (everything before the last customer
 * message's predecessor run) stay visible; earlier menu exchanges collapse
 * into one "Booking menu · N messages" row so the thread opens on what matters.
 * Rule: collapse every leading stretch up to the last handed-over customer
 * message when it is at least `minRun` long.
 */
export function collapseMenuExchange<
  M extends { id: string; direction: 'in' | 'out'; sent_by: string | null },
>(messages: M[], keepTail = 4, minRun = 4): ThreadItem<M>[] {
  if (messages.length - keepTail < minRun) {
    return messages.map((message) => ({ kind: 'message', message }));
  }
  const cut = messages.length - keepTail;
  const head = messages.slice(0, cut);
  // Staff replies are never hidden.
  if (head.some((m) => senderOf(m) === 'staff')) {
    return messages.map((message) => ({ kind: 'message', message }));
  }
  return [
    { kind: 'bot-group', messages: head, id: head[0].id },
    ...messages
      .slice(cut)
      .map((message) => ({ kind: 'message' as const, message })),
  ];
}
