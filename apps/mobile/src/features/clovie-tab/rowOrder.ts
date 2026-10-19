export type RowSlot = 'guide' | 'setup' | 'stories';

interface RowOrderOptions {
  /** The Guide has been opened once. */
  isGuideViewed: boolean;
  /** Whether a "Get set up" ring can show (owner, setup incomplete). */
  hasSetup: boolean;
}

/**
 * Left-to-right order of the stories row. An unseen Guide leads, then "Get
 * set up", then the stories; once the Guide has been seen it moves to the far
 * right so it is out of sight at first glance.
 */
export function rowOrder({
  isGuideViewed,
  hasSetup,
}: RowOrderOptions): RowSlot[] {
  const middle: RowSlot[] = hasSetup ? ['setup', 'stories'] : ['stories'];
  return isGuideViewed ? [...middle, 'guide'] : ['guide', ...middle];
}
