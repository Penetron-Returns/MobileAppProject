/** Corner radii, in points. Surfaces and controls pick a step, never a literal. */
export const RADII = {
  /** Small inset fields (amount, composer). */
  field: 12,
  /** Back pill, filter chip. */
  pill: 20,
  /** Raised cards and groups. */
  raised: 22,
  /** Inset text fields. */
  inset: 24,
  /** The one hero card, choice cards. */
  hero: 26,
  /** Sheets and floating panels. */
  floating: 32,
  full: 9999,
} as const;

export type RadiusStep = keyof typeof RADII;
