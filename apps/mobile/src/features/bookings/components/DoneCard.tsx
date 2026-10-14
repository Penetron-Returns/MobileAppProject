import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

/** The calm "it worked" state: a green check, what happened, and who was told. */
export function DoneCard({ title, lines }: { title: string; lines: string[] }) {
  const depth = useDepth();
  return (
    <View accessibilityLiveRegion="polite" className="items-center px-5 pt-10">
      <Surface
        variant="dome"
        radius={36}
        className="h-[72px] w-[72px] items-center justify-center"
      >
        <Check size={34} strokeWidth={2.6} color={depth.colors.green} />
      </Surface>
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
