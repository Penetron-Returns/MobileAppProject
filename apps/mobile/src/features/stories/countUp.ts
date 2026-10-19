import type { StoryCardNumber } from './model';

/** The count runs in 16 steps over about 0.9 s, easing out. */
export const COUNT_STEPS = 16;
export const COUNT_MS = 880;

/*
 * Everything here runs on the UI thread while the number counts, so each
 * function is a worklet and uses no Intl or imports. `money` reproduces
 * `formatMoney(value, 'ZAR', { decimals: false })` from `@/lib/format`
 * (a test keeps the two in step).
 */

export function easeOutCubic(p: number) {
  'worklet';
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
}

/** Quantises a 0..1 progress to a step, so the text only changes 16 times. */
export function countStep(progress: number) {
  'worklet';
  return Math.min(COUNT_STEPS, Math.floor(Math.max(0, progress) * COUNT_STEPS));
}

/** The value shown at `step` of a count to `target`. */
export function valueAtStep(target: number, step: number) {
  'worklet';
  return Math.round(target * easeOutCubic(step / COUNT_STEPS));
}

/** Groups thousands with commas, as `en-US` does. */
function group(value: number) {
  'worklet';
  const digits = String(Math.abs(value));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** Formats a count, percent or money (integer cents, ZAR, whole rand) value. */
export function formatCount(
  value: number,
  format: StoryCardNumber['format'],
  unit?: string,
) {
  'worklet';
  if (format === 'money') {
    const text = `R ${group(Math.round(Math.abs(value) / 100))}`;
    return value < 0 ? `-${text}` : text;
  }
  const sign = value < 0 ? '-' : '';
  const text =
    format === 'percent' ? `${sign}${group(value)}%` : `${sign}${group(value)}`;
  return unit ? `${text} ${unit}` : text;
}

/** The frame shown at a given progress: format(valueAtStep(...)). */
export function countText(number: StoryCardNumber, progress: number) {
  'worklet';
  return formatCount(
    valueAtStep(number.value, countStep(progress)),
    number.format,
    number.unit,
  );
}

/** Rough advance of a glyph, in em, for the tabular figures at the big number's weight. */
const GLYPH_EM = { digit: 0.6, narrow: 0.3, percent: 0.85, wide: 0.7 };

/**
 * The font size at which `text` fits `available` pt: the base size, shrunk
 * only when the estimated width is over. A TextInput cannot shrink to fit on
 * its own, and the animated number is one.
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

/**
 * The text React hands the number field on each render. Only a card that is
 * entering starts from 0 (and counts up); a card that is leaving, or any card
 * under Reduce Motion, keeps its final value, so a re-render when the card
 * stops being current can never drop the number back to 0.
 */
export function countDefaultText(
  number: StoryCardNumber,
  { isCurrent, isReduced }: { isCurrent: boolean; isReduced: boolean },
) {
  const step = isCurrent && !isReduced ? 0 : COUNT_STEPS;
  return formatCount(
    valueAtStep(number.value, step),
    number.format,
    number.unit,
  );
}
