import { useAppColorScheme } from '@booking/ui';
import { Image } from 'react-native';

/** The companion character as a Settings row glyph (24pt, as on Settings.dc.html). */
export function CompanionGlyph({ size = 24 }: { size?: number }) {
  const { isDark } = useAppColorScheme();
  return (
    <Image
      source={
        isDark
          ? require('@/assets/images/companion-default-dark.png')
          : require('@/assets/images/companion-default.png')
      }
      accessibilityElementsHidden
      importantForAccessibility="no"
      resizeMode="contain"
      style={{ width: Math.max(size, 24), height: Math.max(size, 24) }}
    />
  );
}
