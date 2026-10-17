import * as React from 'react';

import { act, mount } from '@/testing/render';

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
