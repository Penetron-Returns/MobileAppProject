/**
 * "Hey Clovie" commands: pure, deterministic text matching. No AI and no
 * network: a transcript either matches a known phrase or is handed to the
 * companion as a free-text request.
 */

export type VoiceCommand =
  /** The owner said a client has arrived; `name` is who, when they said it. */
  { kind: 'client_arrived'; name?: string } | { kind: 'request'; text: string };

/** Longest transcript the app accepts from a deep link. */
export const MAX_TRANSCRIPT_LENGTH = 500;

const WAKE_PHRASE =
  /^(?:(?:hey|hi|ok|okay)\s+)?clo(?:vie|vey|vee|vi)\b[\s,.:;-]*/;
const FILLERS = new Set([
  'um',
  'uh',
  'er',
  'erm',
  'hmm',
  'please',
  'ok',
  'okay',
  'so',
  'just',
  'now',
  'quick',
]);
const ARRIVAL = [
  'is here',
  'has arrived',
  'have arrived',
  'just arrived',
  'has just arrived',
  'arrived',
  'is in',
  'walked in',
  'just walked in',
  'has walked in',
  'is waiting',
  'is at the door',
  'has come in',
  'is at reception',
  'is at the front desk',
  'is in reception',
];
/** Words that are never (part of) a name: generic subjects, determiners, question words. */
const NOT_NAME = new Set([
  'client',
  'customer',
  'guest',
  'patient',
  'appointment',
  'booking',
  'someone',
  'somebody',
  'everyone',
  'he',
  'she',
  'they',
  'it',
  'my',
  'the',
  'our',
  'your',
  'a',
  'an',
  'next',
  'first',
  'last',
  'new',
  'who',
  'what',
  'when',
  'where',
  'why',
  'how',
  'which',
  'there',
  'here',
  'this',
  'that',
  'anyone',
  'nobody',
  'no',
  'one',
]);
/** Of those, the ones that may sit in front of a name: "my client Thandi is here". */
const GENERIC_SUBJECT = new Set([
  'client',
  'customer',
  'guest',
  'patient',
  'appointment',
  'booking',
  'my',
  'the',
  'our',
  'next',
  'first',
  'new',
  'a',
  'an',
]);

/** Lower-cases, drops accents and punctuation, collapses spaces. Apostrophes survive inside words. */
function normalise(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(normalised: string): string {
  let text = normalised.replace(WAKE_PHRASE, '');
  const words = text.split(' ').filter((w) => w && !FILLERS.has(w));
  text = words.join(' ');
  return text;
}

/** Title-cases a captured name ("thandi mokoena" -> "Thandi Mokoena"). */
function titleCase(name: string): string {
  return name
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Returns the text before an arrival phrase, or null when the sentence is not an arrival. */
function subjectOfArrival(text: string): string | null {
  // The longest phrases first so "has just arrived" is not read as "arrived".
  const phrases = [...ARRIVAL].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (text === phrase) return '';
    if (text.endsWith(` ${phrase}`)) {
      return text.slice(0, text.length - phrase.length - 1);
    }
  }
  // "client's here", "thandi's here"
  const contracted = /^(.*?)'s (?:here|in|arrived|waiting)$/.exec(text);
  return contracted ? contracted[1] : null;
}

/** The name in the subject of an arrival, or undefined when it is only generic words. */
function nameFromSubject(subject: string): string | undefined | null {
  const words = subject.split(' ').filter(Boolean);
  const nameWords = words.filter((w) => !GENERIC_SUBJECT.has(w));
  if (nameWords.length === 0) return undefined;
  // "who is here" / "what is in": not an announcement, a question.
  if (nameWords.some((w) => NOT_NAME.has(w))) return null;
  if (nameWords.length > 3) return null;
  if (!nameWords.every((w) => /^\p{L}[\p{L}'-]*$/u.test(w))) return null;
  return titleCase(nameWords.join(' '));
}

/**
 * Reads what the owner said after "Hey Clovie". "Client has arrived",
 * "my client is here", "Thandi's here" and "Thandi has arrived" check a client
 * in (the name is kept when given); everything else, including an empty
 * transcript, is a request for the companion.
 */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const raw = transcript.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
  const text = stripNoise(normalise(raw));
  const subject = text ? subjectOfArrival(text) : null;
  if (subject !== null) {
    const name = nameFromSubject(subject);
    if (name === undefined) return { kind: 'client_arrived' };
    if (name !== null) return { kind: 'client_arrived', name };
  }
  return { kind: 'request', text: raw };
}
