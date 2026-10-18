import { Image } from 'react-native';

const COMPANION = require('@/assets/images/companion-120.png');

/**
 * The companion character as a Settings row glyph. One image for both schemes
 * (the character is the same blue clover), with an explicit size so Android
 * never lays out a 0x0 Image. Sized to the other row glyphs (20pt) by default.
 */
export function CompanionGlyph({ size = 20 }: { size?: number }) {
  return (
    <Image
      source={COMPANION}
      accessibilityElementsHidden
      importantForAccessibility="no"
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
