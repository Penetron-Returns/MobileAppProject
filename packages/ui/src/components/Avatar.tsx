import * as React from 'react';
import { Image } from 'react-native';

import { cn } from '../lib/cn';
import { initials } from '../lib/initials';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';

const SIZES = {
  sm: { box: 'h-9 w-9', radius: 18, text: 'text-meta' },
  md: { box: 'h-11 w-11', radius: 22, text: 'text-subtitle' },
  lg: { box: 'h-14 w-14', radius: 28, text: 'text-title' },
  xl: { box: 'h-20 w-20', radius: 40, text: 'text-section' },
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps {
  name: string | null | undefined;
  /** A photo or logo; initials show when there is none. */
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}

/**
 * A person or business on a depth "dome": the photo when there is one,
 * otherwise their initials. Decorative (the name sits next to it), so it is
 * hidden from screen readers.
 */
export function Avatar({
  name,
  imageUrl,
  size = 'md',
  className,
}: AvatarProps) {
  const s = SIZES[size];
  return (
    <Surface
      variant="dome"
      radius={s.radius}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
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
        <Text className={cn('font-semibold text-muted-foreground', s.text)}>
          {initials(name)}
        </Text>
      )}
    </Surface>
  );
}
