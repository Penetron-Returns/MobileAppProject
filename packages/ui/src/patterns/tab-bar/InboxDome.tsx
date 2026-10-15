import { Inbox } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Pressable } from '../../primitives/Pressable';
import { Text } from '../../primitives/Text';
import { useDepth } from '../../theme/useDepth';
import { INBOX_DOME_SIZE } from './layout';

export interface InboxDomeProps {
  /** Open escalations that need a reply; the badge is hidden at 0. */
  count: number;
  /** Spoken name, including the count ("Inbox, 2 need a reply"). */
  label: string;
  onPress: () => void;
}

/**
 * The floating Inbox dome with its count badge. Purely presentational: the
 * app decides whether it shows and what the count is.
 */
export function InboxDome({ count, label, onPress }: InboxDomeProps) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      feedback="inset"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        depth.domeFloat,
        {
          width: INBOX_DOME_SIZE,
          height: INBOX_DOME_SIZE,
          borderRadius: INBOX_DOME_SIZE / 2,
        },
      ]}
      className="h-14 w-14 items-center justify-center rounded-full"
    >
      <Inbox size={26} strokeWidth={1.8} color={depth.colors.label} />
      {count > 0 ? (
        <View
          style={depth.badge}
          className="absolute -right-1 -top-1 h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5"
        >
          <Text
            style={{ color: depth.colors.onFill }}
            className="text-meta font-semibold"
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
