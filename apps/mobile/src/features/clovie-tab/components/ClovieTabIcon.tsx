import { useAppColorScheme, type TabIconProps } from '@booking/ui';
import { Image } from 'react-native';

const LIGHT = require('@/assets/images/companion-default.png');
const DARK = require('@/assets/images/companion-default-dark.png');

/**
 * The Clovie tab's glyph: the static companion image at tab-icon size. Full
 * colour when the tab is selected, dimmed when not. A still
 * image, so it costs nothing at rest.
 */
export function ClovieTabIcon({ size, isActive }: TabIconProps) {
  const { isDark } = useAppColorScheme();
  return (
    <Image
      testID="clovie-tab-icon"
      source={isDark ? DARK : LIGHT}
      accessibilityElementsHidden
      importantForAccessibility="no"
      resizeMode="contain"
      style={{
        width: size + 4,
        height: size + 4,
        opacity: isActive ? 1 : 0.5,
      }}
    />
  );
}
