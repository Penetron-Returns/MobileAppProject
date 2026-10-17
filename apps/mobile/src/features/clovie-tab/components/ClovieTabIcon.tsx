import type { TabIconProps } from '@booking/ui';
import Svg, { Ellipse, Path } from 'react-native-svg';

/**
 * The Clovie tab's glyph: his four-lobed clover body and two eyes as a line
 * icon, drawn with the colour, size and stroke weight the bar gives every
 * other tab icon.
 */
export function ClovieTabIcon({ size, strokeWidth, color }: TabIconProps) {
  return (
    <Svg
      testID="clovie-tab-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
    >
      <Path
        d="M7 7 A5 5 0 0 1 17 7 A5 5 0 0 1 17 17 A5 5 0 0 1 7 17 A5 5 0 0 1 7 7 Z"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Ellipse cx="10" cy="12" rx="1.1" ry="1.6" fill={color} />
      <Ellipse cx="14" cy="12" rx="1.1" ry="1.6" fill={color} />
    </Svg>
  );
}
