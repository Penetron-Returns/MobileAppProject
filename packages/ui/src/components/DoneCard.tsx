import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { SuccessMark } from './SuccessMark';

export interface DoneCardProps {
  title: string;
  lines: string[];
  /** `dome` is the calm green check; `solid` is the large filled completion mark. */
  variant?: 'dome' | 'solid';
}

/** The calm "it worked" state: a green check, what happened, and who was told. */
export function DoneCard({ title, lines, variant = 'dome' }: DoneCardProps) {
  const depth = useDepth();
  return (
    <View accessibilityLiveRegion="polite" className="items-center px-5 pt-10">
      {variant === 'solid' ? (
        <SuccessMark />
      ) : (
        <Surface
          variant="dome"
          radius={36}
          className="h-[72px] w-[72px] items-center justify-center"
        >
          <Check size={34} strokeWidth={2.6} color={depth.colors.green} />
        </Surface>
      )}
      <Text
        role="heading"
        aria-level="1"
        className="mt-4 text-center text-large-title font-bold"
      >
        {title}
      </Text>
      {lines.map((line) => (
        <Text
          key={line}
          className="mt-1 text-center text-title text-muted-foreground"
        >
          {line}
        </Text>
      ))}
    </View>
  );
}
