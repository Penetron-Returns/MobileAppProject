import { useDepth, withAlpha } from '@booking/ui';

/** The onboarding boards' blue (a touch deeper than the system tint). Dark mode lifts it for contrast. */
const TINT = { light: '#0A69DB', dark: '#3B8EF0' } as const;

/** Type styles of the boards: size, line height, weight, tracking. */
export const TYPE = {
  hero: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  link: { fontSize: 17, lineHeight: 22, fontWeight: '500' },
  tile: { fontSize: 19, lineHeight: 24, fontWeight: '600' },
  sub: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  meta: { fontSize: 13, lineHeight: 16, fontWeight: '400' },
  price: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
} as const;

/**
 * Colours of the onboarding boards, read from the Depth tokens so dark mode
 * works: the screen ground, white cards with a hairline, and the tint.
 */
export function useOnbColors() {
  const depth = useDepth();
  const isDark = depth.scheme === 'dark';
  const tint = isDark ? TINT.dark : TINT.light;
  const ink = isDark ? '235,235,245' : '60,60,67';
  return {
    isDark,
    ground: depth.ground,
    tint,
    tintWash: withAlpha(tint, 0.1),
    label: depth.colors.label,
    secondary: depth.colors.secondary,
    surface: depth.raised.backgroundColor as string,
    ring: depth.colors.hairline,
    dotOff: `rgba(${ink},0.22)`,
    disabledFill: `rgba(${ink},0.12)`,
    disabledText: `rgba(${ink},0.6)`,
    placeholder: `rgba(${ink},0.3)`,
    spinnerTrack: `rgba(${ink},0.2)`,
    radioOff: `rgba(${ink},0.4)`,
    green: depth.colors.green,
    onFill: '#FFFFFF',
  };
}

export type OnbColors = ReturnType<typeof useOnbColors>;
