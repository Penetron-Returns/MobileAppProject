/**
 * Type scale (SOFT.md / Foundations): nothing a person must read is under
 * 15px; 13px is for times and meta only. Sizes follow the system font
 * (SF on iOS, Roboto on Android) and scale with the user's font size setting.
 * `tailwind-preset.cjs` mirrors this table as `text-*` utilities.
 */
export const TYPE_SCALE = {
  largeTitle: { size: 34, lineHeight: 41, weight: '700', letterSpacing: 0.4 },
  section: { size: 22, lineHeight: 28, weight: '700', letterSpacing: 0 },
  title: { size: 17, lineHeight: 22, weight: '400', letterSpacing: 0 },
  subtitle: { size: 15, lineHeight: 20, weight: '400', letterSpacing: 0 },
  meta: { size: 13, lineHeight: 18, weight: '400', letterSpacing: 0 },
  button: { size: 17, lineHeight: 22, weight: '600', letterSpacing: 0 },
} as const;

export type TypeStep = keyof typeof TYPE_SCALE;
