export interface ViewerPosition {
  story: number;
  card: number;
}

export type NavAction = 'next' | 'prev';

export type NavTransition =
  /** Same story, another card. */
  | 'card'
  /** Another story: the cube turns and Clovie hops across. */
  | 'story'
  /** Past the last card of the last story. */
  | 'close'
  /** Back on the very first card: restart its timer, nothing moves. */
  | 'restart';

export interface NavResult {
  position: ViewerPosition;
  transition: NavTransition;
  /** 1 forwards, -1 back. */
  dir: 1 | -1;
}

/**
 * Next/previous across stories and cards. `cardCounts[i]` is how many cards
 * story `i` has. Tapping next on the last card opens the next story, and the
 * last card of the last story closes the viewer. Going back from a story's
 * first card opens the previous story at its first card.
 */
export function navigate(
  cardCounts: number[],
  position: ViewerPosition,
  action: NavAction,
): NavResult {
  const { story, card } = position;
  if (action === 'next') {
    if (card + 1 < cardCounts[story]) {
      return {
        position: { story, card: card + 1 },
        transition: 'card',
        dir: 1,
      };
    }
    if (story + 1 < cardCounts.length) {
      return {
        position: { story: story + 1, card: 0 },
        transition: 'story',
        dir: 1,
      };
    }
    return { position, transition: 'close', dir: 1 };
  }
  if (card > 0) {
    return {
      position: { story, card: card - 1 },
      transition: 'card',
      dir: -1,
    };
  }
  if (story > 0) {
    return {
      position: { story: story - 1, card: 0 },
      transition: 'story',
      dir: -1,
    };
  }
  return { position, transition: 'restart', dir: -1 };
}

/** Which tap zone a touch at `x` hits: the left third goes back, the rest goes next. */
export function tapAction(x: number, width: number): NavAction {
  return x < width * (140 / 402) ? 'prev' : 'next';
}

/** True when this move is the last card of the last story finishing. */
export function isLastCard(cardCounts: number[], position: ViewerPosition) {
  return (
    position.story === cardCounts.length - 1 &&
    position.card === cardCounts[position.story] - 1
  );
}

export function clampIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}
