/**
 * Instant answers: match the transcript, read today's bookings the app already holds (or loads from the fast
 * endpoint) and answer with no LLM call. Anything unmatched, unanswerable, stale or offline returns null so the caller
 * hands the request to Clovie. Read-only. Pure apart from the injected loader, clock and event sink; never logs or
 * sends the transcript, a name or a time.
 */
import { composeAnswer } from './compose';
import { matchInstantIntent } from './match';
import type { InstantData, InstantIntentKind } from './types';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** How long a snapshot may be before it is reloaded: the schedule changes when clients book on WhatsApp. */
export const MAX_AGE_MS = 2 * 60_000;
/** The longest a reload may take before Clovie answers instead. */
export const LOAD_TIMEOUT_MS = 2_000;

export interface InstantEvent {
  /** The intent recognised, or `none` when the sentence was not an instant question */
  intent: InstantIntentKind | 'none';
  answered: boolean;
  ms: number;
}

export interface InstantDeps {
  now: () => Date;
  t: Translate;
  h12: boolean;
  /** Loads today's bookings now (the prefetch when one is fresh, else the fast endpoint). */
  load: () => Promise<InstantData>;
  /** A snapshot kept in memory with when it was loaded (epoch ms), if there is one. */
  cached?: () => { data: InstantData; loadedAt: number } | null;
  /** Reports the outcome (no text); the app maps it to `voice_instant_answer`. */
  report?: (event: InstantEvent) => void;
  /** A monotonic clock in ms, for the report. Defaults to `Date.now`. */
  clock?: () => number;
  maxAgeMs?: number;
  loadTimeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function freshData(deps: InstantDeps): Promise<InstantData | null> {
  const kept = deps.cached?.();
  const maxAge = deps.maxAgeMs ?? MAX_AGE_MS;
  if (kept && deps.now().getTime() - kept.loadedAt <= maxAge) return kept.data;
  return withTimeout(deps.load(), deps.loadTimeoutMs ?? LOAD_TIMEOUT_MS);
}

/** The spoken (and shown) answer for `transcript`, or null to ask Clovie. */
export async function answerInstant(
  transcript: string,
  deps: InstantDeps,
): Promise<string | null> {
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const finish = (intent: InstantEvent['intent'], text: string | null) => {
    deps.report?.({
      intent,
      answered: text !== null,
      ms: Math.max(0, Math.round(clock() - started)),
    });
    return text;
  };
  const intent = matchInstantIntent(transcript);
  if (!intent) return finish('none', null);
  const data = await freshData(deps);
  if (!data) return finish(intent.kind, null);
  const text = composeAnswer(intent, data, {
    now: deps.now(),
    t: deps.t,
    h12: deps.h12,
  });
  return finish(intent.kind, text);
}
