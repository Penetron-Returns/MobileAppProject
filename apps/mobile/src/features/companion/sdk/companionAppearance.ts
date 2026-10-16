import { RADII, type DepthTokens } from '@booking/ui';
import type { Appearance } from '@nerova/react-native';

/**
 * Maps our Depth tokens onto the SDK's `Appearance`, so the SDK sheet wears
 * the app's own colours. Pure: the screen passes in `useDepth()` and the
 * scheme. The SDK colours are flat (hex or rgb), so each surface takes the
 * solid fallback of its gradient. No `font.family`: the SDK then uses the
 * platform font (SF on iOS, Roboto on Android), as the rest of the app does
 * (we ship no Inter).
 */
export function buildCompanionAppearance(
  depth: DepthTokens,
  isDark: boolean,
): Appearance {
  const { colors } = depth;
  return {
    colorMode: isDark ? 'dark' : 'light',
    colors: {
      primary: colors.tint,
      background: depth.ground.backgroundColor as string,
      surface: depth.sheet.backgroundColor as string,
      raised: depth.raised.backgroundColor as string,
      inset: depth.inset.backgroundColor as string,
      text: colors.label,
      textSecondary: colors.secondary,
      separator: colors.hairline,
      success: colors.success,
      warning: colors.amber,
      destructive: colors.red,
    },
    radii: { sheet: RADII.floating, card: RADII.hero, control: RADII.inset },
    depth: 'raised',
    characterPlacement: 'edge',
  };
}
