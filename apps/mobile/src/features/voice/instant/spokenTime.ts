/**
 * Spoken and typed clock times, English: "3", "3pm", "15:30", "half past three", "quarter to four", "noon".
 * Pure. `parseSpokenTime` only describes what was said; `resolveSpokenTime` pins it to today in the business
 * timezone and refuses anything past, nonexistent (a DST gap) or unclear.
 */
import {
  minutesSinceMidnight,
  pad,
  todayISO,
  zonedTimeToUtc,
} from '@/lib/time';

import type { SpokenTime } from './types';

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};

/** Reads a number (digits or words, 0-59) at `i`; returns it and the index after it. */
function takeNumber(
  words: readonly string[],
  i: number,
): { value: number; next: number } | null {
  const word = words[i];
  if (word === undefined) return null;
  if (/^\d{1,2}$/.test(word)) return { value: Number(word), next: i + 1 };
  const tens = TENS[word];
  if (tens !== undefined) {
    const unit = UNITS[words[i + 1] ?? ''];
    if (unit !== undefined && unit >= 1 && unit <= 9) {
      return { value: tens + unit, next: i + 2 };
    }
    return { value: tens, next: i + 1 };
  }
  const unit = UNITS[word];
  return unit === undefined ? null : { value: unit, next: i + 1 };
}

/** Removes a trailing am / pm / "a m" / "in the morning" and says which it was. */
function takeMeridiem(text: string): { text: string; meridiem?: 'am' | 'pm' } {
  const m =
    /\s*\b(?:([ap]) ?m|in the (morning|afternoon|evening)|this (morning|afternoon|evening)|tonight)$/.exec(
      text,
    );
  if (!m) return { text };
  const am = m[1] === 'a' || m[2] === 'morning' || m[3] === 'morning';
  return { text: text.slice(0, m.index).trim(), meridiem: am ? 'am' : 'pm' };
}

/** "past" or "to" forms: half past three, quarter to four, ten past two, twenty five to five. */
function relative(
  words: readonly string[],
): { hour: number; minute: number } | null {
  let amount: number;
  let i: number;
  if (words[0] === 'half') {
    amount = 30;
    i = 1;
  } else if (words[0] === 'quarter') {
    amount = 15;
    i = 1;
  } else {
    const n = takeNumber(words, 0);
    if (!n || n.value < 1 || n.value > 29) return null;
    amount = n.value;
    i = n.next;
  }
  const dir = words[i];
  if (dir !== 'past' && dir !== 'to') return null;
  if (dir === 'to' && amount === 30) return null;
  const hour = takeNumber(words, i + 1);
  if (!hour || hour.next !== words.length) return null;
  if (hour.value < 1 || hour.value > 12) return null;
  return { hour: hour.value, minute: dir === 'past' ? amount : -amount };
}

/**
 * The time in `input` (lower-cased; only `:` and `'` kept as punctuation), or null unless the WHOLE input is one
 * clear time. Never guesses: anything the grammar below does not cover is null, so the question goes to Clovie.
 */
export function parseSpokenTime(input: string): SpokenTime | null {
  let text = input
    .trim()
    .replace(/^(?:at|around|by|for)\s+/, '')
    .replace(/(\d)\s*([ap])\.?\s?m\b\.?/g, '$1 $2m');
  if (/^(?:now|right now|at the moment|currently)$/.test(text)) {
    return { kind: 'now' };
  }
  if (text === 'noon' || text === 'midday') {
    return { kind: 'clock', hour: 12, minute: 0, meridiem: 'pm' };
  }
  if (text === 'midnight') {
    return { kind: 'clock', hour: 12, minute: 0, meridiem: 'am' };
  }
  const split = takeMeridiem(text);
  text = split.text;
  const { meridiem } = split;
  const words = text ? text.split(' ') : [];
  if (words.length === 0) return null;

  const make = (hour: number, minute: number): SpokenTime | null => {
    if (hour < 0 || hour > 23 || minute < -59 || minute > 59) return null;
    // "3 pm" needs a 12-hour clock: "15 pm" and "0 pm" are not times.
    if (meridiem && (hour > 12 || hour === 0)) return null;
    return meridiem
      ? { kind: 'clock', hour, minute, meridiem }
      : { kind: 'clock', hour, minute };
  };

  if (words.length === 1) {
    const colon = /^(\d{1,2}):(\d{2})$/.exec(words[0]);
    if (colon) {
      return Number(colon[2]) < 60
        ? make(Number(colon[1]), Number(colon[2]))
        : null;
    }
    const four = /^(\d{2})(\d{2})$/.exec(words[0]);
    if (four) {
      return Number(four[2]) < 60
        ? make(Number(four[1]), Number(four[2]))
        : null;
    }
  }

  const rel = relative(words);
  if (rel) return make(rel.hour, rel.minute);

  const h = takeNumber(words, 0);
  if (!h || h.value > 23) return null;
  const i = h.next;
  if (i === words.length) {
    // A bare number is a time only when it is clearly one: "3", "three", "15".
    return /^\d/.test(words[0]) || words[0] in UNITS ? make(h.value, 0) : null;
  }
  if (words[i] === "o'clock" || words[i] === 'oclock') {
    return i + 1 === words.length ? make(h.value, 0) : null;
  }
  // "three oh five" is 3:05, "three thirty" is 3:30, "three forty five" is 3:45.
  if (words[i] === 'oh') {
    const unit = takeNumber(words, i + 1);
    const valid = unit && unit.value >= 1 && unit.value <= 9;
    return valid && unit.next === words.length
      ? make(h.value, unit.value)
      : null;
  }
  const m = takeNumber(words, i);
  if (!m || /^\d/.test(words[i]) || m.value < 10 || m.next !== words.length) {
    return null;
  }
  return make(h.value, m.value);
}

/** Minutes after midnight for a bare 12-hour clock, likeliest first: 1 to 6 is the afternoon, 7 to 12 the morning. */
function bareCandidates(hour: number, minute: number): number[] {
  const am = (hour % 12) * 60 + minute;
  const pm = am + 12 * 60;
  // Noon is 12 pm first ("12:30"), then the small hours.
  return hour === 12 || hour <= 6 ? [pm, am] : [am, pm];
}

export interface ResolvedTime {
  /** The instant asked about */
  at: Date;
  /** Wall-clock minutes after midnight in the business timezone */
  minutes: number;
}

/**
 * Pins a spoken time to today in `timezone`. Null when it is already past (a different question), does not exist
 * (the hour a DST change skips) or is not today. For a bare 1-12 the likelier half of the day that is still ahead is
 * used; the answer repeats the time, so a wrong guess is heard rather than hidden.
 */
export function resolveSpokenTime(
  time: SpokenTime,
  options: { now: Date; timezone: string },
): ResolvedTime | null {
  const { now, timezone } = options;
  if (time.kind === 'now') {
    return { at: now, minutes: minutesSinceMidnight(now, timezone) };
  }
  let choices: number[];
  if (time.meridiem) {
    const base = (time.hour % 12) * 60 + time.minute;
    choices = [time.meridiem === 'pm' ? base + 12 * 60 : base];
  } else if (time.hour === 0 || time.hour >= 13) {
    choices = [time.hour * 60 + time.minute];
  } else {
    choices = bareCandidates(time.hour, time.minute);
  }
  const date = todayISO(timezone, now);
  for (const minutes of choices) {
    if (minutes < 0 || minutes >= 24 * 60) continue;
    const hh = pad(Math.floor(minutes / 60));
    const at = zonedTimeToUtc(date, `${hh}:${pad(minutes % 60)}`, timezone);
    // A time inside a DST gap lands on another wall-clock minute: it does not exist today.
    if (minutesSinceMidnight(at, timezone) !== minutes) continue;
    // The current minute still counts as "now".
    if (at.getTime() >= now.getTime() - 60_000) return { at, minutes };
  }
  return null;
}
