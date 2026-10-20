import * as React from 'react';
import { Image } from 'react-native';

import { cn } from '../lib/cn';
import { initials } from '../lib/initials';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

const SIZES = {
  sm: { box: 'h-9 w-9', radius: 18, text: 'text-meta', ring: 2 },
  md: { box: 'h-11 w-11', radius: 22, text: 'text-subtitle', ring: 2 },
  lg: { box: 'h-14 w-14', radius: 28, text: 'text-title', ring: 2 },
  xl: { box: 'h-20 w-20', radius: 40, text: 'text-section', ring: 3 },
  /** The person page's portrait: 84pt, 3pt ring, 30pt initials. */
  hero: { box: 'h-[84px] w-[84px]', radius: 42, text: 'text-3xl', ring: 3 },
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps {
  name: string | null | undefined;
  /** A photo or logo; initials show when there is none. */
  imageUrl?: string | null;
  size?: AvatarSize;
  /** A colour ring around the dome (a team member's calendar colour). */
  ring?: string | null;
  /** `tint` fills the dome with the accent (the business row of Settings). */
  tone?: 'neutral' | 'tint';
  className?: string;
}

const TINT_LABEL = {
  textShadowColor: 'rgba(0,0,0,0.14)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 0,
} as const;

/**
 * A person or business on a depth "dome": the photo when there is one,
 * otherwise their initials. Decorative (the name sits next to it), so it is
 * hidden from screen readers.
 */
export function Avatar({
  name,
  imageUrl,
  size = 'md',
  ring,
  tone = 'neutral',
  className,
}: AvatarProps) {
  const depth = useDepth();
  const s = SIZES[size];
  const isTint = tone === 'tint';
  return (
    <Surface
      variant={isTint ? 'domeTint' : ring ? 'domeRing' : 'dome'}
      radius={s.radius}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={ring ? { borderWidth: s.ring, borderColor: ring } : undefined}
      className={cn(
        'items-center justify-center overflow-hidden',
        s.box,
        className,
      )}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          accessibilityIgnoresInvertColors
          className="h-full w-full"
        />
      ) : (
        <Text
          style={
            isTint ? [{ color: depth.colors.onFill }, TINT_LABEL] : undefined
          }
          className={cn(
            isTint
              ? 'text-xl font-bold'
              : cn('font-semibold text-muted-foreground', s.text),
          )}
        >
          {initials(name)}
        </Text>
      )}
    </Surface>
  );
}
