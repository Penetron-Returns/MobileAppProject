import * as React from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import Animated from 'react-native-reanimated';

import { Pressable } from '../../primitives/Pressable';
import { Text } from '../../primitives/Text';
import { useDepth } from '../../theme/useDepth';
import { INBOX_DOME_SIZE } from './layout';
import { usePressBounce } from './usePressBounce';

/** The character inside the dome (TabBar.dc.html: 40pt in a 56pt dome). */
const CHARACTER_SIZE = 40;

export interface CompanionDomeProps {
  /** The companion character image for the current colour scheme. */
  character: ImageSourcePropType;
  /** Things that need the owner's attention; the badge is hidden at 0. */
  count: number;
  /** Spoken name, including the count when there is one. */
  label: string;
  onPress: () => void;
}

/**
 * The floating companion dome of the paid plans: the character in the same
 * raised dome the Inbox uses on Free, with an inverse badge when something
 * needs attention. Presentational, like `InboxDome`; bounces on press.
 */
export function CompanionDome({
  character,
  count,
  label,
  onPress,
}: CompanionDomeProps) {
  const depth = useDepth();
  const bounce = usePressBounce();
  return (
    <Animated.View style={bounce.style}>
      <Pressable
        onPress={onPress}
        feedback="inset"
        // The spring on the wrapper does the shrinking.
        pressedScale={1}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...bounce.handlers}
        style={[
          depth.domeFloat,
          {
            width: INBOX_DOME_SIZE,
            height: INBOX_DOME_SIZE,
            borderRadius: INBOX_DOME_SIZE / 2,
          },
        ]}
        className="items-center justify-center rounded-full"
      >
        <Image
          source={character}
          accessibilityElementsHidden
          importantForAccessibility="no"
          resizeMode="contain"
          style={{ width: CHARACTER_SIZE, height: CHARACTER_SIZE }}
        />
        {count > 0 ? (
          <View
            style={{ backgroundColor: depth.colors.label }}
            className="absolute -right-1 -top-1 h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5"
          >
            <Text
              style={{
                color: depth.colors.badgeRing,
                fontVariant: ['tabular-nums'],
              }}
              className="text-meta font-semibold"
            >
              {count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
