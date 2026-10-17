import { Surface, Text, initials, useDepth } from '@booking/ui';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import type { BookClient } from '../phoneBook';
import { clientDisplayName } from '../phoneBook';
import { GROUP_MARGIN } from './ClientGroup';

interface RecentCardProps {
  clients: BookClient[];
  onOpen: (id: string) => void;
  label: string;
}

/** The people most recently chatted with or booked: one raised card, one row of domes. */
export const RecentCard = React.memo(function RecentCard({
  clients,
  onOpen,
  label,
}: RecentCardProps) {
  const depth = useDepth();
  return (
    <Surface
      variant="raised"
      radius={26}
      role="group"
      accessibilityLabel={label}
      style={GROUP_MARGIN}
      className="flex-row px-2 pb-2.5 pt-3.5"
    >
      {clients.map((client) => {
        const name = clientDisplayName(client);
        const first = name.split(' ')[0];
        return (
          <Pressable
            key={client.id}
            onPress={() => onOpen(client.id)}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="min-h-11 min-w-0 flex-1 items-center gap-1.5"
          >
            <Surface
              variant="dome"
              radius={26}
              className="h-[52px] w-[52px] items-center justify-center"
            >
              <Text
                style={{ color: depth.colors.secondary }}
                className="text-title font-semibold"
              >
                {initials(name)}
              </Text>
            </Surface>
            <View className="max-w-full">
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                className="text-meta font-medium"
              >
                {first}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Surface>
  );
});
