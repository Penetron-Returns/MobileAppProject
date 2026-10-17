import { Text } from '@booking/ui';

import { TYPE, useOnbColors } from '../theme';

/** A screen's heading in the boards' 22/29 medium (or the 28/34 hero on the welcome). */
export function Heading({
  children,
  size = 'title',
  align = 'left',
  label,
}: {
  children: string;
  size?: 'title' | 'hero';
  align?: 'left' | 'center';
  /** Spoken form when the text carries line breaks. */
  label?: string;
}) {
  const c = useOnbColors();
  return (
    <Text
      role="heading"
      aria-level="1"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={[TYPE[size], { color: c.label, textAlign: align }]}
    >
      {children}
    </Text>
  );
}

/** Secondary 17/22 line under a heading. */
export function Subline({
  children,
  align = 'left',
}: {
  children: string;
  align?: 'left' | 'center';
}) {
  const c = useOnbColors();
  return (
    <Text
      style={[
        { fontSize: 17, lineHeight: 22 },
        { color: c.secondary, textAlign: align },
      ]}
    >
      {children}
    </Text>
  );
}
