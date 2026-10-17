import { formatMoney } from '@/lib/format';

import type { StoryCardNumber } from './model';

/** The count runs in 16 steps over about 0.9 s, easing out. */
export const COUNT_STEPS = 16;
export const COUNT_MS = 880;

export function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
}

/** Quantises a 0..1 progress to a step, so the UI only re-renders 16 times. */
export function countStep(progress: number) {
  'worklet';
  return Math.min(COUNT_STEPS, Math.floor(Math.max(0, progress) * COUNT_STEPS));
}

/** The value shown at `step` of a count to `target`. */
export function valueAtStep(target: number, step: number) {
  return Math.round(target * easeOutCubic(step / COUNT_STEPS));
}

function group(value: number) {
  return String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Formats a count, percent or money (integer cents, ZAR, whole rand) value. */
export function formatCount(
  value: number,
  format: StoryCardNumber['format'],
  unit?: string,
) {
  const sign = value < 0 ? '-' : '';
  let text: string;
  switch (format) {
    case 'money':
      return formatMoney(value, 'ZAR', { decimals: false });
    case 'percent':
      text = `${sign}${group(value)}%`;
      break;
    case 'count':
      text = `${sign}${group(value)}`;
      break;
  }
  return unit ? `${text} ${unit}` : text;
}

/** The frame shown at a given progress: format(valueAtStep(...)). */
export function countText(number: StoryCardNumber, progress: number) {
  return formatCount(
    valueAtStep(number.value, countStep(progress)),
    number.format,
    number.unit,
  );
}
