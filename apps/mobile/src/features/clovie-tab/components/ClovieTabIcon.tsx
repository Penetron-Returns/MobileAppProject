import type { TabIconProps } from '@booking/ui';
import { Clover } from 'lucide-react-native';

/**
 * The Clovie tab's glyph: the lucide clover, drawn with the colour, size and
 * stroke weight the bar gives every other tab icon.
 */
export function ClovieTabIcon({ size, strokeWidth, color }: TabIconProps) {
  return (
    <Clover
      testID="clovie-tab-icon"
      size={size}
      strokeWidth={strokeWidth}
      color={color}
    />
  );
}
