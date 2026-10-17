import * as React from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
} from 'react-native-reanimated';

import type { Story, StoryEvent } from './model';
import { EASE_SPRING } from './motion';
import {
  clampIndex,
  navigate,
  type NavAction,
  type ViewerPosition,
} from './navigation';
import {
  CARD_MS,
  CUBE_LEAD_MS,
  CUBE_MS,
  LOCK_MS,
  remainingMs,
  SLIDE_MS,
} from './progress';
import type { Travel } from './ViewerCharacter';

export interface PlayerOptions {
  stories: Story[];
  initialIndex: number;
  isReduced: boolean;
  onViewed: (storyId: string, lastCardIndex: number) => void;
  onEvent: (event: StoryEvent) => void;
  /** The last card finished (or the user ran out of cards): close the viewer. */
  onFinished: () => void;
}

export interface Transition {
  kind: 'card' | 'story';
  dir: 1 | -1;
}

const REDUCED_MS = 200;

/**
 * The viewer's brain: where we are, the 5 s card timer (pause on hold), the
 * card and story transitions, Clovie's travel and the analytics events. All
 * timing lives on the UI thread (`progress` and `transition` are shared
 * values); JS only changes state when something actually moves.
 */
export function useStoryPlayer(options: PlayerOptions) {
  const { stories, isReduced } = options;
  const counts = React.useMemo(
    () => stories.map((s) => s.cards.length),
    [stories],
  );
  const [position, setPosition] = React.useState<ViewerPosition>({
    story: clampIndex(options.initialIndex, stories.length),
    card: 0,
  });
  const [outgoing, setOutgoing] = React.useState<ViewerPosition | null>(null);
  const [transition, setTransition] = React.useState<Transition>({
    kind: 'card',
    dir: 1,
  });
  const [travel, setTravel] = React.useState<Travel>({
    id: 0,
    mode: 'walk',
    dir: 1,
  });

  const progress = useSharedValue(0);
  const turn = useSharedValue(1);

  const latest = React.useRef({ ...options, counts, position });
  latest.current = { ...options, counts, position };
  const isLocked = React.useRef(false);
  const isHolding = React.useRef(false);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const emit = (type: StoryEvent['type'], pos: ViewerPosition) => {
    const story = latest.current.stories[pos.story];
    latest.current.onEvent({
      type,
      storyId: story.id,
      cardId: story.cards[pos.card]?.id,
      cardIndex: pos.card,
    });
  };

  const runTimer = (ms: number) => {
    progress.value = withTiming(
      1,
      { duration: ms, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(onTimerDone)();
      },
    );
  };
  const startCard = (pos: ViewerPosition) => {
    cancelAnimation(progress);
    progress.value = 0;
    emit('card_view', pos);
    if (!isHolding.current) runTimer(CARD_MS);
  };

  const finishTransition = () => setOutgoing(null);
  const playTurn = (
    ms: number,
    easing: EasingFunction | EasingFunctionFactory,
  ) => {
    turn.value = 0;
    turn.value = withTiming(1, { duration: ms, easing }, (finished) => {
      if (finished) runOnJS(finishTransition)();
    });
  };

  const go = (action: NavAction, source: 'tap' | 'auto') => {
    if (isLocked.current) return;
    const { counts: c, position: cur, stories: all } = latest.current;
    const result = navigate(c, cur, action);
    const lastIndex = cur.card;
    if (result.transition === 'restart') {
      startCard(cur);
      return;
    }
    const isEnd = action === 'next' && lastIndex === c[cur.story] - 1;
    if (source === 'tap' && !isEnd) emit('skip', cur);
    const isLeaving =
      result.transition === 'close' || result.transition === 'story';
    if (isLeaving) latest.current.onViewed(all[cur.story].id, lastIndex);
    if (isEnd) emit('complete', cur);
    if (result.transition === 'close') {
      cancelAnimation(progress);
      isLocked.current = true;
      latest.current.onFinished();
      return;
    }

    const lockMs = isReduced ? REDUCED_MS : LOCK_MS[result.transition];
    isLocked.current = true;
    later(() => {
      isLocked.current = false;
    }, lockMs);
    const dir = result.dir;
    const arrive = (kind: 'card' | 'story', mode: Travel['mode']) => {
      setOutgoing(cur);
      setPosition(result.position);
      setTransition({ kind, dir });
      setTravel((t) => ({ id: t.id + 1, mode, dir }));
      const ms = isReduced ? REDUCED_MS : kind === 'story' ? CUBE_MS : SLIDE_MS;
      playTurn(ms, isReduced ? Easing.linear : EASE_SPRING);
      startCard(result.position);
    };

    if (result.transition === 'card' || isReduced) {
      cancelAnimation(progress);
      arrive(result.transition, 'walk');
      return;
    }
    // Story change: Clovie hops off first, then the cube turns and he lands.
    cancelAnimation(progress);
    setTravel((t) => ({ id: t.id + 1, mode: 'exit', dir }));
    later(() => {
      arrive('story', 'enter');
    }, CUBE_LEAD_MS);
  };

  const onTimerDone = () => latest.current && goRef.current('next', 'auto');
  const goRef = React.useRef(go);
  goRef.current = go;

  const pause = () => {
    isHolding.current = true;
    cancelAnimation(progress);
  };
  const resume = () => {
    if (!isHolding.current) return;
    isHolding.current = false;
    if (!isLocked.current) runTimer(remainingMs(progress.value));
  };

  // Open: first card starts, `open` is reported once.
  React.useEffect(() => {
    emit('open', latest.current.position);
    startCard(latest.current.position);
    const pending = timers.current;
    return () => {
      cancelAnimation(progress);
      cancelAnimation(turn);
      pending.forEach(clearTimeout);
    };
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reports the story being left (for the close paths the player does not drive). */
  const reportViewed = () => {
    const { stories: all, position: cur } = latest.current;
    latest.current.onViewed(all[cur.story].id, cur.card);
  };

  return {
    position,
    outgoing,
    transition,
    travel,
    progress,
    turn,
    next: () => go('next', 'tap'),
    prev: () => go('prev', 'tap'),
    pause,
    resume,
    reportViewed,
    emit: (type: StoryEvent['type']) => emit(type, latest.current.position),
  };
}
