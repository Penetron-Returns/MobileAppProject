/**
 * Colour roles, light and dark, as HSL channels ("H S% L%", the shadcn
 * convention). `apps/mobile/global.css` declares the same values as CSS
 * variables for NativeWind classes; a test (`colors.test.ts`) fails when the
 * two drift. Palette: iOS system blue tint, ground #F7F7FA (#0B0C10 dark),
 * true-black / white labels (docs/design-system.md).
 */
export const COLOR_ROLES = {
  light: {
    background: '240 20% 97%',
    foreground: '0 0% 0%',
    card: '0 0% 100%',
    cardForeground: '0 0% 0%',
    popover: '0 0% 100%',
    popoverForeground: '0 0% 0%',
    primary: '211 100% 50%',
    primaryForeground: '0 0% 100%',
    secondary: '240 20% 96%',
    secondaryForeground: '211 100% 50%',
    muted: '240 14% 94%',
    mutedForeground: '240 2% 46%',
    accent: '211 100% 95%',
    accentForeground: '211 100% 40%',
    destructive: '0 72% 51%',
    destructiveForeground: '0 0% 100%',
    border: '240 10% 90%',
    input: '240 10% 86%',
    ring: '211 100% 50%',
    brand: '211 100% 50%',
    brandSoft: '211 100% 95%',
    success: '142 64% 32%',
    successSoft: '138 60% 93%',
    warning: '32 90% 44%',
    warningSoft: '40 95% 93%',
    whatsapp: '142 70% 42%',
    whatsappSoft: '142 60% 92%',
    statusConfirmed: '211 100% 45%',
    statusConfirmedSoft: '211 100% 95%',
    statusPending: '4 70% 52%',
    statusPendingSoft: '4 85% 95%',
    statusCompleted: '215 16% 40%',
    statusCompletedSoft: '216 20% 93%',
    statusCancelled: '0 72% 48%',
    statusCancelledSoft: '0 86% 95%',
  },
  dark: {
    background: '230 22% 6%',
    foreground: '0 0% 100%',
    card: '230 11% 12%',
    cardForeground: '0 0% 100%',
    popover: '230 11% 12%',
    popoverForeground: '0 0% 100%',
    primary: '211 100% 52%',
    primaryForeground: '0 0% 100%',
    secondary: '230 9% 18%',
    secondaryForeground: '211 100% 62%',
    muted: '230 10% 15%',
    mutedForeground: '240 8% 70%',
    accent: '211 50% 20%',
    accentForeground: '211 100% 80%',
    destructive: '0 70% 55%',
    destructiveForeground: '0 0% 100%',
    border: '230 9% 20%',
    input: '230 9% 24%',
    ring: '211 100% 56%',
    brand: '211 100% 56%',
    brandSoft: '211 50% 20%',
    success: '142 55% 50%',
    successSoft: '142 40% 16%',
    warning: '38 90% 58%',
    warningSoft: '35 50% 16%',
    whatsapp: '142 65% 45%',
    whatsappSoft: '142 40% 16%',
    statusConfirmed: '211 100% 72%',
    statusConfirmedSoft: '211 50% 20%',
    statusPending: '4 85% 70%',
    statusPendingSoft: '4 40% 20%',
    statusCompleted: '215 20% 70%',
    statusCompletedSoft: '216 20% 20%',
    statusCancelled: '0 80% 70%',
    statusCancelledSoft: '0 40% 20%',
  },
} as const;

export type ColorScheme = keyof typeof COLOR_ROLES;
export type ColorRole = keyof (typeof COLOR_ROLES)['light'];

/** The CSS custom property that carries a role (`statusConfirmed` -> `--status-confirmed`). */
export function cssVariable(role: ColorRole): string {
  return `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** "211 100% 50%" -> "hsl(211, 100%, 50%)" for places that need a raw colour. */
export function hsl(channels: string): string {
  const [h, s, l] = channels.split(' ');
  return `hsl(${h}, ${s}, ${l})`;
}

/** Raw colours for places classes cannot reach (SVG strokes, navigation theme, RefreshControl). */
function raw(scheme: ColorScheme) {
  const r = COLOR_ROLES[scheme];
  return {
    background: hsl(r.background),
    foreground: hsl(r.foreground),
    card: hsl(r.card),
    primary: hsl(r.primary),
    brand: hsl(r.brand),
    brandSoft: hsl(r.brandSoft),
    muted: hsl(r.muted),
    mutedForeground: hsl(r.mutedForeground),
    border: hsl(r.border),
    destructive: hsl(r.destructive),
    whatsapp: hsl(r.whatsapp),
    /** Calendar "closed time" hatch (not a CSS variable). */
    hatch:
      scheme === 'light'
        ? 'hsla(215, 16%, 47%, 0.14)'
        : 'hsla(215, 20%, 65%, 0.12)',
  } as const;
}

export const THEME = { light: raw('light'), dark: raw('dark') } as const;

export type ThemeColors = (typeof THEME)['light'];
