/**
 * Instant-answer intents: pure, deterministic matching of the few questions an owner asks all day ("who's next",
 * "how many today", "am I free at 3", "when is Jake coming", "first appointment"). English today; each intent is a
 * list of fully anchored patterns, so a sentence that says anything more ("who's next and move them to four") does
 * not match and goes to Clovie. Read-only by construction: any write verb in the sentence rejects it, and a sentence
 * matching two intents is ambiguous and rejected as well. No network, no AI.
 */
import { parseSpokenTime } from './spokenTime';
import type { InstantIntent } from './types';

const MAX_WORDS = 14;

/** Any of these means the owner wants something done, not looked up. */
const WRITE_WORDS = new Set([
  'move',
  'cancel',
  'book',
  'rebook',
  'reschedule',
  'schedule',
  'add',
  'create',
  'delete',
  'remove',
  'change',
  'swap',
  'switch',
  'message',
  'text',
  'call',
  'send',
  'remind',
  'arrived',
  'arrive',
  'check',
  'confirm',
  'block',
  'set',
  'put',
  'tell',
  'ask',
]);

/** Words that are never (part of) a person's name. */
const NOT_NAME = new Set([
  'it',
  'that',
  'this',
  'there',
  'here',
  'my',
  'the',
  'a',
  'an',
  'next',
  'first',
  'last',
  'today',
  'tomorrow',
  'tonight',
  'now',
  'lunch',
  'closing',
  'opening',
  'open',
  'close',
  'time',
  'anyone',
  'anything',
  'someone',
  'something',
  'everyone',
  'everything',
  'nobody',
  'he',
  'she',
  'they',
  'client',
  'customer',
  'appointment',
  'booking',
  'shop',
  'salon',
  'business',
  'calendar',
  'diary',
  'schedule',
  'we',
  'i',
  'you',
]);

const LEADING = new RegExp(
  '^(?:(?:hey|hi|ok|okay|um|uh|erm|so|please|clovie|quickly|quick|can you|could you|would you|tell me|let me know|i want to know|i need to know|i would like to know|do you know|just) )+',
);
const TRAILING = /(?: (?:please|thanks|thank you|clovie|for me))+$/;

/** Lower-cases, expands "who's"-style contractions, drops punctuation (keeps `3:30`) and polite padding. */
export function normalizeUtterance(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/\b(who|what|how|when|where|there|here|that|it)'s\b/g, '$1 is')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\bwe're\b/g, 'we are')
    .replace(/\bam i\b/g, 'am i')
    .replace(/(\d):(\d)/g, '$1_$2')
    .replace(/[^a-z0-9_' ]+/g, ' ')
    .replace(/_/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
  let previous = '';
  while (previous !== s) {
    previous = s;
    s = s.replace(LEADING, '').replace(TRAILING, '').trim();
  }
  return s;
}

const NEXT: readonly RegExp[] = [
  /^who is (?:my |the )?next(?: client| customer| appointment| booking| one)?(?: is)?(?: today)?$/,
  /^who is (?:coming|due|up|arriving) next(?: today)?$/,
  /^who do i have next(?: today)?$/,
  /^which (?:client|customer) is next(?: today)?$/,
  /^(?:what|when) is (?:my |the )?next (?:appointment|booking|client|customer)(?: today)?$/,
  /^(?:my |the )?next (?:appointment|booking|client|customer)(?: today)?$/,
];

const COUNT: readonly RegExp[] = [
  /^how many (?:bookings|appointments|clients|customers) (?:do i have|have i got|are there|am i seeing|are booked)(?: today| so far today)?(?: left| remaining| still)?(?: today)?$/,
  /^how many (?:bookings|appointments|clients|customers) (?:today|left today|are left|are left today)$/,
  /^how busy (?:am i|is it|are we|is my day|is today)(?: today)?$/,
  /^how (?:does|is) my day (?:look|looking)(?: today)?$/,
  /^how is today looking$/,
];

const EDGE: readonly [RegExp, 'first' | 'last'][] = [
  [
    /^(?:what|when) is (?:my |the )?first (?:appointment|booking|client|customer)(?: of the day| today)?$/,
    'first',
  ],
  [
    /^what time is (?:my |the )?first (?:appointment|booking|client|customer)(?: of the day| today)?$/,
    'first',
  ],
  [
    /^who is (?:my |the )?first (?:client|customer|appointment|booking)(?: of the day| today)?$/,
    'first',
  ],
  [/^when do i start(?: today)?$/, 'first'],
  [
    /^(?:what|when) is (?:my |the )?last (?:appointment|booking|client|customer)(?: of the day| today)?$/,
    'last',
  ],
  [
    /^what time is (?:my |the )?last (?:appointment|booking|client|customer)(?: of the day| today)?$/,
    'last',
  ],
  [
    /^who is (?:my |the )?last (?:client|customer|appointment|booking)(?: of the day| today)?$/,
    'last',
  ],
  [/^when do i (?:finish|end|finish up|wrap up|close)(?: today)?$/, 'last'],
];

const FREE_VERB = '(?:free|busy|available|booked|taken)';
const AT = '(?: (?:at|around|by|for))?';
/** "is 2pm open", "is 3 free", "is 15:30 available" */
const TIME_FIRST = new RegExp(`^is (.+?) (?:open|${FREE_VERB})(?: today)?$`);
/** "am i free at 3", "is emma free at 4", "are we busy now" */
const SUBJECT_FIRST = new RegExp(
  `^(?:am i|are we|is (.+?)) ${FREE_VERB}${AT} (.+?)(?: today)?$`,
);
/** "do i have anything at 15:30" */
const ANYTHING_AT = new RegExp(
  `^(?:do i have|have i got|is there) (?:anything|something|any bookings?|any appointments?|a booking|an appointment|someone)(?: (?:on|booked|scheduled|in|there|planned))*${AT} (.+?)(?: today)?$`,
);

const CLIENT_TIME =
  /^(?:when is|when does|when will|when do i see|what time is|what time does|what time will|what time do i see) (.+?)(?: (?:coming|coming in|come in|due|booked|scheduled|arriving|appointment|booking|in|here|visiting|arrive|arrives|come))*(?: today)?$/;

function words(text: string): string[] {
  return text.split(' ').filter(Boolean);
}

/** A person's name from 1 to 3 spoken words, or null (possessive "'s" dropped, anything non-name rejected). */
function asName(text: string, maxWords: number): string | null {
  const parts = words(text.replace(/'s\b/g, '').replace(/s'$/, 's'));
  if (parts.length === 0 || parts.length > maxWords) return null;
  const ok = parts.every((w) => /^[a-z][a-z'-]+$/.test(w) && !NOT_NAME.has(w));
  return ok ? parts.join(' ') : null;
}

function matchNext(s: string): InstantIntent | null {
  return NEXT.some((re) => re.test(s)) ? { kind: 'next' } : null;
}

function matchCount(s: string): InstantIntent | null {
  return COUNT.some((re) => re.test(s)) ? { kind: 'count' } : null;
}

function matchEdge(s: string): InstantIntent | null {
  const hit = EDGE.find(([re]) => re.test(s));
  return hit ? { kind: 'edge', which: hit[1] } : null;
}

function matchFreeAt(s: string): InstantIntent | null {
  const timeFirst = TIME_FIRST.exec(s);
  if (timeFirst) {
    const time = parseSpokenTime(timeFirst[1]);
    return time ? { kind: 'free_at', time } : null;
  }
  const anything = ANYTHING_AT.exec(s);
  if (anything) {
    const time = parseSpokenTime(anything[1]);
    return time ? { kind: 'free_at', time } : null;
  }
  const subject = SUBJECT_FIRST.exec(s);
  if (!subject) return null;
  const time = parseSpokenTime(subject[2]);
  if (!time) return null;
  if (subject[1] === undefined) return { kind: 'free_at', time };
  const staff = asName(subject[1], 2);
  return staff ? { kind: 'free_at', time, staff } : null;
}

function matchClientTime(s: string): InstantIntent | null {
  const hit = CLIENT_TIME.exec(s);
  if (!hit) return null;
  const name = asName(hit[1], 3);
  return name ? { kind: 'client_time', name } : null;
}

const MATCHERS = [
  matchNext,
  matchCount,
  matchEdge,
  matchFreeAt,
  matchClientTime,
] as const;

/**
 * The one intent a transcript clearly asks for, or null (not an instant question, a write, too long, or matching
 * more than one intent). Null always means "hand it to Clovie".
 */
export function matchInstantIntent(transcript: string): InstantIntent | null {
  const s = normalizeUtterance(transcript);
  const tokens = words(s);
  if (tokens.length === 0 || tokens.length > MAX_WORDS) return null;
  if (tokens.some((w) => WRITE_WORDS.has(w))) return null;
  const hits = MATCHERS.map((match) => match(s)).filter(
    (hit): hit is InstantIntent => hit !== null,
  );
  return hits.length === 1 ? hits[0] : null;
}
