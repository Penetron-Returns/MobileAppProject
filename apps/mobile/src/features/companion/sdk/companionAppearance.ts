import { RADII, type DepthTokens } from '@booking/ui';
import type { Appearance } from '@nerova/react-native';
import { Platform } from 'react-native';

/**
 * Maps our Depth tokens onto the SDK's `Appearance`, so the SDK sheet wears
 * the app's own colours. Pure: the screen passes in `useDepth()` and the
 * scheme. The SDK colours are flat (hex or rgb), so each surface takes the
 * solid fallback of its gradient. Fonts follow docs/design-language.md: the
 * system font on iOS (SF), Inter on Android. We bundle no Inter yet, so the SDK
 * skips it (via expo-font) and falls back to the system font until we do.
 */
export function buildCompanionAppearance(
  depth: DepthTokens,
  isDark: boolean,
  os: string = Platform.OS,
): Appearance {
  const { colors } = depth;
  return {
    colorMode: isDark ? 'dark' : 'light',
    font: { family: os === 'android' ? ['Inter', 'System'] : 'System' },
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
