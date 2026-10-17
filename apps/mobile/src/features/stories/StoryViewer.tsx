import { useReduceMotion } from '@booking/ui';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { layoutForCard, placeOnScreen } from './layout';
import { KindTile } from './KindTile';
import type { OriginFrame, Story, StoryCard, StoryEvent } from './model';
import { EASE_SPRING } from './motion';
import { tapAction } from './navigation';
import { ProgressBars } from './ProgressBars';
import { Rise } from './Rise';
import { StoryCardFace } from './StoryCardFace';
import { ToneGlow } from './ToneGlow';
import { TONES } from './tones';
import { TurnFace } from './TurnFace';
import { useStoryPlayer } from './useStoryPlayer';
import { ViewerCharacter } from './ViewerCharacter';

export interface StoryViewerProps {
  stories: Story[];
  initialIndex?: number;
  /** The tapped bubble's window frame: the viewer scales out of it and back into it. */
  originFrame?: OriginFrame;
  onClose: () => void;
  onViewed: (storyId: string, lastCardIndex: number) => void;
  onEvent?: (event: StoryEvent) => void;
  onAction?: (card: StoryCard) => void;
}

/** The board's phone is 402 pt wide and its header sits 47 pt below the top. */
const SAFE_TOP = 47;
const CLOSE_DRAG = 120;
const OPEN_MS = 460;
const CLOSE_MS = 340;

/**
 * Full-screen story viewer over the app. Tap right for next, left for back,
 * hold to pause, swipe down to close. Everything that moves runs on the UI
 * thread and only while this modal is mounted.
 */
export function StoryViewer(props: StoryViewerProps) {
  const { stories, originFrame, onClose, onViewed, onAction } = props;
  const { t } = useTranslation();
  const isReduced = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = Math.max(0, insets.top - SAFE_TOP);

  const open = useSharedValue(0);
  const drag = useSharedValue(0);
  const [isClosing, setIsClosing] = React.useState(false);
  const closingRef = React.useRef(false);
  const onEvent = props.onEvent ?? noop;

  const closeNow = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    open.value = withTiming(
      0,
      {
        duration: isReduced ? 200 : CLOSE_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [isReduced, onClose, open]);

  const player = useStoryPlayer({
    stories,
    initialIndex: props.initialIndex ?? 0,
    isReduced,
    onViewed,
    onEvent,
    onFinished: closeNow,
  });

  React.useEffect(() => {
    open.value = withTiming(1, {
      duration: isReduced ? 200 : OPEN_MS,
      easing: isReduced ? Easing.linear : EASE_SPRING,
    });
  }, [isReduced, open]);

  const playerRef = React.useRef(player);
  playerRef.current = player;

  const requestClose = React.useCallback(() => {
    if (closingRef.current) return;
    playerRef.current.reportViewed();
    playerRef.current.emit('close');
    closeNow();
  }, [closeNow]);

  const story = stories[player.position.story];
  const card = story.cards[player.position.card];
  const layout = layoutForCard(card, story.kind);
  const accent = TONES[card.tone].accent;
  const target = placeOnScreen(layout.placement, width, top);

  const handleTap = (x: number) =>
    tapAction(x, width) === 'prev'
      ? playerRef.current.prev()
      : playerRef.current.next();
  const gesture = React.useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, ok) => {
        if (ok) handleTap(e.x);
      });
    const hold = Gesture.LongPress()
      .minDuration(180)
      .maxDistance(20)
      .runOnJS(true)
      .onStart(() => playerRef.current.pause())
      .onFinalize(() => playerRef.current.resume());
    const pan = Gesture.Pan()
      .activeOffsetY(14)
      .failOffsetX([-30, 30])
      .onUpdate((e) => {
        drag.value = Math.max(0, e.translationY);
      })
      .onEnd((e) => {
        if (e.translationY > CLOSE_DRAG || e.velocityY > 900) {
          runOnJS(requestClose)();
        } else {
          drag.value = withSpring(0, { damping: 22, stiffness: 260 });
        }
      });
    return Gesture.Simultaneous(pan, Gesture.Race(hold, tap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, requestClose, drag]);

  const s0 = originFrame ? Math.max(0.05, originFrame.width / width) : 0.92;
  const cx = originFrame ? originFrame.x + originFrame.width / 2 : width / 2;
  const cy = originFrame ? originFrame.y + originFrame.height / 2 : height / 2;
  const shell = useAnimatedStyle(() => {
    const p = open.value;
    if (isReduced) return { opacity: p };
    const pull = 1 - Math.min(drag.value, 300) / 1500;
    return {
      opacity: 0.5 + 0.5 * p,
      borderRadius: (1 - p) * 190,
      transform: [
        { translateX: (cx - width / 2) * (1 - p) },
        { translateY: (cy - height / 2) * (1 - p) + drag.value },
        { scale: (s0 + (1 - s0) * p) * pull },
      ],
    };
  });

  const faces = [
    ...(player.outgoing
      ? [{ pos: player.outgoing, role: 'out' as const }]
      : []),
    { pos: player.position, role: 'in' as const },
  ];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.shell, shell]}>
          <LinearGradient colors={['#0F2D42', '#0A1A28']} style={styles.fill} />
          <ToneGlow tone={card.tone} width={width} height={height} />

          {faces.map(({ pos, role }) => {
            const c = stories[pos.story].cards[pos.card];
            const l = layoutForCard(c, stories[pos.story].kind);
            return (
              <TurnFace
                key={`${pos.story}:${pos.card}`}
                role={role}
                kind={player.transition.kind}
                dir={player.transition.dir}
                turn={player.turn}
                width={width}
                isReduced={isReduced}
              >
                <View style={[styles.content, { top: 166 + top }]}>
                  <StoryCardFace
                    card={c}
                    layout={l}
                    isCurrent={role === 'in'}
                  />
                </View>
              </TurnFace>
            );
          })}

          <GestureDetector gesture={gesture}>
            <View
              style={[
                styles.touch,
                { top: 124 + top, bottom: insets.bottom + 96 },
              ]}
            />
          </GestureDetector>

          <View style={[styles.bars, { top: 58 + top }]}>
            <ProgressBars
              count={story.cards.length}
              current={player.position.card}
              progress={player.progress}
              color={accent}
              label={t('stories.progress', {
                current: player.position.card + 1,
                total: story.cards.length,
              })}
            />
          </View>
          <View style={[styles.header, { top: 72 + top }]}>
            <KindTile kind={story.kind} size={36} isDark={false} />
            <Text numberOfLines={1} style={styles.title}>
              {story.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stories.close')}
              onPress={requestClose}
              hitSlop={4}
              style={styles.closeButton}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path
                  d="M6 6l12 12 M18 6L6 18"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          </View>

          <ViewerCharacter
            emotion={layout.emotion}
            target={target}
            travel={player.travel}
            screenWidth={width}
            isSearching={layout.isSearching}
            isCatching={layout.isCatching}
          />

          {card.action && !isClosing ? (
            <Rise
              key={card.id}
              delayMs={300}
              style={[styles.actionWrap, { bottom: insets.bottom + 28 }]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  player.emit('action');
                  onAction?.(card);
                }}
                style={styles.action}
              >
                <LinearGradient
                  colors={['#3D93FF', '#007AFF', '#0069DB']}
                  locations={[0, 0.55, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.actionText}>{card.action.label}</Text>
              </Pressable>
            </Rise>
          ) : null}
          <View
            pointerEvents="none"
            style={[
              styles.handle,
              { bottom: Math.max(insets.bottom - 12, 10) },
            ]}
          />
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function noop() {}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shell: { flex: 1, overflow: 'hidden', backgroundColor: '#0A1A28' },
  content: { position: 'absolute', left: 24, right: 24, bottom: 120 },
  touch: { position: 'absolute', left: 0, right: 0 },
  bars: { position: 'absolute', left: 12, right: 12 },
  header: {
    position: 'absolute',
    left: 16,
    right: 6,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionWrap: { position: 'absolute', left: 24, right: 24 },
  action: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  handle: {
    position: 'absolute',
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
});
