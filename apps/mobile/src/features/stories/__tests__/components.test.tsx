import * as React from 'react';

import { act, mount } from '@/testing/render';

import { COUNT_MS } from '../countUp';
import type { StoryCardNumber } from '../model';
import { NumberLine } from '../NumberLine';
import { SAMPLE_STORIES } from '../sampleStories';
import { StoryRing } from '../StoryRing';
import { StoryViewer } from '../StoryViewer';

let mockReduce = false;
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  useReduceMotion: () => mockReduce,
}));

// The native gesture handler is a device concern: a chainable stand-in is enough here.
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const chain: unknown = new Proxy(function () {}, {
    get: () => chain,
    apply: () => chain,
  });
  return {
    Gesture: chain,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: View,
  };
});

beforeEach(() => {
  jest.useFakeTimers();
  mockReduce = false;
});
afterEach(() => jest.useRealTimers());

const texts = (tree: ReturnType<typeof mount>) =>
  tree.root
    .findAll((n) => (n.type as unknown) === 'Text')
    .map((n) => [n.props.children].flat().join(''));

describe('StoryRing', () => {
  it('labels new and viewed stories for screen readers', () => {
    const [brief] = SAMPLE_STORIES;
    const fresh = mount(<StoryRing story={brief} onPress={jest.fn()} />);
    expect(
      fresh.root.findByProps({ accessibilityRole: 'button' }).props
        .accessibilityLabel,
    ).toBe('Brief · 07:30, new');
    const seen = mount(
      <StoryRing story={{ ...brief, viewed: true }} onPress={jest.fn()} />,
    );
    expect(
      seen.root.findByProps({ accessibilityRole: 'button' }).props
        .accessibilityLabel,
    ).toBe('Brief · 07:30, viewed');
  });
});

/** The viewer mounts its cards one frame after the shell. */
const settle = () =>
  act(() => {
    jest.advanceTimersByTime(20);
  });

describe('StoryViewer', () => {
  const setup = () => {
    const props = {
      stories: SAMPLE_STORIES,
      onClose: jest.fn(),
      onViewed: jest.fn(),
      onEvent: jest.fn(),
      onAction: jest.fn(),
    };
    const tree = mount(<StoryViewer {...props} />);
    settle();
    return { tree, ...props };
  };

  it('opens on the first card and reports open and card_view', () => {
    const { tree, onEvent } = setup();
    expect(texts(tree)).toContain('bookings today');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'open', storyId: 'brief' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'card_view',
        cardId: 'b1',
        cardIndex: 0,
      }),
    );
    act(() => tree.unmount());
  });

  it('shows one persistent Clovie and the close button', () => {
    const { tree } = setup();
    expect(
      tree.root.findAllByProps({ testID: 'story-clovie' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Close story' }),
    ).toBeTruthy();
    act(() => tree.unmount());
  });

  it('runs one blinking sprite on the persistent Clovie and no WebView', () => {
    const { tree } = setup();
    const sprites = tree.root.findAll(
      (n) => n.props.testID === 'clovie-sprite' && typeof n.type === 'string',
    );
    expect(sprites).toHaveLength(1);
    expect(
      tree.root.findAll((n) => n.props.testID === 'clovie-webview'),
    ).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('mounts the shell first and the cards and Clovie one frame later', () => {
    const props = {
      stories: SAMPLE_STORIES,
      onClose: jest.fn(),
      onViewed: jest.fn(),
    };
    const tree = mount(<StoryViewer {...props} />);
    expect(tree.root.findAllByProps({ testID: 'story-clovie' })).toHaveLength(
      0,
    );
    settle();
    expect(
      tree.root.findAllByProps({ testID: 'story-clovie' }).length,
    ).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('has labelled Previous, Pause and Next buttons for people who cannot tap or hold', () => {
    const { tree } = setup();
    for (const label of ['Previous card', 'Pause story', 'Next card']) {
      expect(
        tree.root.findAllByProps({ accessibilityLabel: label }).length,
      ).toBeGreaterThan(0);
    }
    act(() => {
      tree.root
        .findAllByProps({ accessibilityLabel: 'Pause story' })[0]
        .props.onPress();
    });
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Resume story' }).length,
    ).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('moves to the next card from the Next button', () => {
    const { tree, onEvent } = setup();
    act(() => {
      tree.root
        .findAllByProps({ accessibilityLabel: 'Next card' })[0]
        .props.onPress();
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card_view', cardIndex: 1 }),
    );
    act(() => tree.unmount());
  });

  it('shows the final count at once with Reduce Motion on', () => {
    mockReduce = true;
    const { tree } = setup();
    expect(texts(tree)).toContain('5');
    act(() => tree.unmount());
  });

  it('closes from the close button, reporting viewed and close', () => {
    const { tree, onViewed, onEvent } = setup();
    act(() => {
      tree.root
        .findByProps({ accessibilityLabel: 'Close story' })
        .props.onPress();
    });
    expect(onViewed).toHaveBeenCalledWith('brief', 0);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'close', storyId: 'brief' }),
    );
    act(() => tree.unmount());
  });

  it('calls onAction, and reports it, from the optional action button', () => {
    const onAction = jest.fn();
    const onEvent = jest.fn();
    // Start on the card that carries "Remind Tumelo".
    const story = {
      ...SAMPLE_STORIES[0],
      cards: SAMPLE_STORIES[0].cards.slice(1),
    };
    const tree = mount(
      <StoryViewer
        stories={[story]}
        onClose={jest.fn()}
        onViewed={jest.fn()}
        onEvent={onEvent}
        onAction={onAction}
      />,
    );
    settle();
    const button = tree.root.find(
      (n) =>
        typeof n.props.onPress === 'function' &&
        n.props.accessibilityRole === 'button' &&
        n.findAll((c) => c.props.children === 'Remind Tumelo').length > 0,
    );
    act(() => button.props.onPress());
    expect(onAction).toHaveBeenCalledWith(story.cards[0]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action', cardId: 'b3' }),
    );
    act(() => tree.unmount());
  });
});

describe('NumberLine', () => {
  const number = { value: 490200, format: 'money', currency: 'ZAR' } as const;
  /** Re-renders the same NumberLine in place, as a parent's state change does. */
  let setCurrent: (isCurrent: boolean) => void = () => {};
  function Harness({ first, n }: { first: boolean; n: StoryCardNumber }) {
    const [isCurrent, set] = React.useState(first);
    setCurrent = set;
    return (
      <NumberLine
        number={n}
        accent="#fff"
        hasPush={false}
        isCurrent={isCurrent}
      />
    );
  }
  const line = (isCurrent: boolean, n: StoryCardNumber = number) => (
    <Harness first={isCurrent} n={n} />
  );
  const big = (tree: ReturnType<typeof mount>) =>
    tree.root.find(
      (n) =>
        (n.type as unknown) === 'Text' &&
        n.props.accessibilityLabel !== undefined,
    );
  const run = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });

  it('counts up from zero to the final value', () => {
    const tree = mount(line(true));
    expect(texts(tree)).toContain('R 0');
    run(COUNT_MS + 100);
    expect(texts(tree)).toContain('R 4,902');
  });

  it('keeps the final value when the parent re-renders after the count', () => {
    const tree = mount(line(true));
    run(COUNT_MS + 100);
    act(() => setCurrent(true));
    act(() => setCurrent(false));
    act(() => setCurrent(true));
    run(COUNT_MS + 100);
    expect(texts(tree)).toContain('R 4,902');
    expect(texts(tree)).not.toContain('R 0');
  });

  it('does not restart at zero when a re-render lands mid-count', () => {
    const tree = mount(line(true));
    run(COUNT_MS / 2);
    const mid = texts(tree).join('|');
    expect(mid).not.toContain('R 0');
    act(() => setCurrent(true));
    act(() => setCurrent(false));
    act(() => setCurrent(true));
    expect(texts(tree).join('|')).toBe(mid);
    run(COUNT_MS + 100);
    expect(texts(tree)).toContain('R 4,902');
  });

  it('shows the final value for a card that is not current', () => {
    const tree = mount(line(false));
    expect(texts(tree)).toContain('R 4,902');
  });

  it('shows the final value at once under reduce motion', () => {
    mockReduce = true;
    const tree = mount(line(true));
    expect(texts(tree)).toContain('R 4,902');
  });

  it('gives screen readers the final value while counting', () => {
    const tree = mount(line(true));
    expect(big(tree).props.accessibilityLabel).toBe('R 4,902');
  });

  it('formats money in the business currency', () => {
    const tree = mount(line(true, { ...number, currency: 'USD' }));
    run(COUNT_MS + 100);
    expect(texts(tree)).toContain('$4,902');
  });
});
