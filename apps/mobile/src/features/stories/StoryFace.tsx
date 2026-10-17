import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { StoryCard, StoryKind } from './model';
import { StoryCardFace } from './StoryCardFace';
import { TurnFace } from './TurnFace';

interface StoryFaceProps {
  role: 'in' | 'out';
  transitionKind: 'card' | 'story';
  dir: 1 | -1;
  turn: SharedValue<number>;
  turnId: number;
  width: number;
  isReduced: boolean;
  isTransitioning: boolean;
  card: StoryCard;
  storyKind: StoryKind;
  /** Extra top inset of the content (the safe area beyond the board's 47 pt). */
  top: number;
}

/**
 * One mounted face: the turning shell around one card. Memoised, so the
 * viewer's own re-renders (a progress commit, a hold) leave both faces alone.
 */
export const StoryFace = React.memo(function StoryFace({
  role,
  transitionKind,
  dir,
  turn,
  turnId,
  width,
  isReduced,
  isTransitioning,
  card,
  storyKind,
  top,
}: StoryFaceProps) {
  return (
    <TurnFace
      role={role}
      kind={transitionKind}
      dir={dir}
      turn={turn}
      turnId={turnId}
      width={width}
      isReduced={isReduced}
      isTransitioning={isTransitioning}
    >
      <View style={[styles.content, { top: 166 + top }]}>
        <StoryCardFace card={card} kind={storyKind} isCurrent={role === 'in'} />
      </View>
    </TurnFace>
  );
});

const styles = StyleSheet.create({
  content: { position: 'absolute', left: 24, right: 24, bottom: 120 },
});
