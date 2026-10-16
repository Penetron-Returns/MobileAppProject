import { useDepth } from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';

import { BAR_COUNT, barHeight, type LevelStore } from './levelStore';
import { voiceTokens } from './voiceTokens';

const BAR_WIDTH = 5;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => i);

/**
 * The live level waveform: 29 bars, the newest level on the right, the board's bell shape and irregular peaks. It
 * subscribes to the level store itself (~15 updates a second while listening), so nothing else re-renders. With
 * `isLive` false (Reduce Motion, hidden, backgrounded) the bars hold the board's resting shape and the store is not
 * read at all. Decorative: the transcript and the status carry the meaning.
 */
export function VoiceWaveform({
  store,
  isLive,
}: {
  store: LevelStore;
  isLive: boolean;
}) {
  const tokens = voiceTokens(useDepth());
  const levels = React.useSyncExternalStore(
    isLive ? store.subscribe : subscribeNothing,
    store.getSnapshot,
  );
  return (
    <View
      testID="voice-waveform"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        alignSelf: 'stretch',
        height: 48,
      }}
    >
      {BARS.map((i) => (
        <View
          key={i}
          testID="voice-bar"
          style={{
            width: BAR_WIDTH,
            height: barHeight(i, isLive ? (levels[i] ?? 0) : null),
            borderRadius: 3,
            experimental_backgroundImage: tokens.barImage,
          }}
        />
      ))}
    </View>
  );
}

const subscribeNothing = () => () => undefined;
