import { formatMoney } from '@/lib/format';

import type { StoryCardNumber } from './model';

/** The count runs in 16 steps over about 0.9 s, easing out. */
export const COUNT_STEPS = 16;
export const COUNT_MS = 880;

/** Used when a story's number names no currency; the business's currency is set by the caller. */
export const DEFAULT_CURRENCY = 'USD';

export function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
}

/** Quantises a 0..1 progress to a step, so the text only changes 16 times. */
export function countStep(progress: number) {
  return Math.min(COUNT_STEPS, Math.floor(Math.max(0, progress) * COUNT_STEPS));
}

/** The value shown at `step` of a count to `target`. */
export function valueAtStep(target: number, step: number) {
  return Math.round(target * easeOutCubic(step / COUNT_STEPS));
}

/** Groups thousands with commas, as `en-US` does. */
function group(value: number) {
  const digits = String(Math.abs(value));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** Formats a count, percent or money (integer cents, whole units of `currency`) value. */
export function formatCount(
  value: number,
  format: StoryCardNumber['format'],
  unit?: string,
  currency: string = DEFAULT_CURRENCY,
) {
  if (format === 'money') {
    return formatMoney(value, currency, { decimals: false });
  }
  const sign = value < 0 ? '-' : '';
  const text =
    format === 'percent' ? `${sign}${group(value)}%` : `${sign}${group(value)}`;
  return unit ? `${text} ${unit}` : text;
}

/** The frame shown at a given step: format(valueAtStep(...)). */
export function countTextAtStep(number: StoryCardNumber, step: number) {
  return formatCount(
    valueAtStep(number.value, step),
    number.format,
    number.unit,
    number.currency,
  );
}

/** Rough advance of a glyph, in em, for the tabular figures at the big number's weight. */
const GLYPH_EM = { digit: 0.6, narrow: 0.3, percent: 0.85, wide: 0.7 };

/**
 * The font size at which `text` fits `available` pt: the base size, shrunk
 * only when the estimated width is over. The count is plain text that
 * must not jump size while it grows.
 */
export function fitFontSize(text: string, available: number, base: number) {
  let em = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += GLYPH_EM.digit;
    else if (ch === ',' || ch === ' ' || ch === '.' || ch === '-')
      em += GLYPH_EM.narrow;
    else if (ch === '%') em += GLYPH_EM.percent;
    else em += GLYPH_EM.wide;
  }
  const width = em * base;
  return width <= available ? base : Math.floor((base * available) / width);
}
