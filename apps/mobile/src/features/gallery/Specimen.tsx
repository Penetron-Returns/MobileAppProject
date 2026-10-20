import { Text } from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';

/** A titled block of the gallery. */
export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3 px-5 pt-8">
      <View className="gap-0.5">
        <Text role="heading" aria-level="2" className="text-section font-bold">
          {title}
        </Text>
        {note ? (
          <Text className="text-subtitle text-muted-foreground">{note}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One variant or state, captioned. */
export function Specimen({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-meta text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">{children}</View>
  );
}
