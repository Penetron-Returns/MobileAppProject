import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Story } from '@/features/stories';
import { act, mount } from '@/testing/render';

import { StoriesRow } from '../components/StoriesRow';
import { GUIDE_VIEWED_KEY, resetGuideStore } from '../guideStore';
import { buildGuideStory, withEmptyKinds } from '../localStories';
import { toEventDTO } from '../storiesModel';

jest.mock('../useAfterInteractions', () => ({
  useAfterInteractions: () => true,
}));
jest.mock('@/features/setup-checklist/useSetupStory', () => ({
  useSetupStory: () => null,
}));

// Rings press straight through, and the viewer is a stub that exposes its stories and callbacks.
let mockViewer: Record<string, any> | null = null;
jest.mock('@/features/stories/StoryRing', () => {
  const { Pressable: P, Text: T } = require('react-native');
  return {
    StoryRing: ({ story, onPress }: any) => (
      <P
        accessibilityRole="button"
        accessibilityLabel={`ring:${story.id}`}
        onPress={() => onPress(story.id, { x: 0, y: 0, width: 80, height: 80 })}
      >
        <T>{story.title}</T>
      </P>
    ),
  };
});
jest.mock('@/features/stories/StoryViewer', () => ({
  StoryViewer: (props: Record<string, unknown>) => {
    mockViewer = props;
    return null;
  },
}));

const onViewed = jest.fn();
const onEvent = jest.fn();
const identity = ((k: string) => k) as never;

function mountRow(stories: Story[]) {
  return mount(
    <StoriesRow
      stories={stories}
      isLoading={false}
      onViewed={onViewed}
      onEvent={onEvent}
      onAction={jest.fn()}
      onClose={jest.fn()}
    />,
  );
}
const press = (tree: ReturnType<typeof mountRow>, id: string) =>
  act(() =>
    tree.root
      .findAll(
        (n) => n.props.accessibilityLabel === `ring:${id}` && !!n.props.onPress,
      )[0]
      .props.onPress(),
  );

beforeEach(async () => {
  jest.clearAllMocks();
  mockViewer = null;
  await AsyncStorage.clear();
  resetGuideStore();
});

describe('local stories', () => {
  it('opens one calm card from a placeholder ring', async () => {
    const tree = mountRow([]);
    await act(async () => {});
    press(tree, 'local:empty-clients');
    const stories = mockViewer?.stories as Story[];
    expect(stories.map((s) => s.kind)).toEqual([
      'guide',
      'brief',
      'clients',
      'business',
      'product',
    ]);
    expect(stories[2].cards).toHaveLength(1);
    expect(stories[2].cards[0]).toMatchObject({
      headline: 'No new updates yet',
      body: "Check in later! I'll post here when a client books, cancels or comes back.",
      emotion: 'calm',
    });
  });

  it('never sends synthetic ids to the backend callbacks', async () => {
    const tree = mountRow([]);
    await act(async () => {});
    press(tree, 'local:empty-brief');
    act(() => {
      mockViewer?.onViewed('local:empty-brief', 0);
      mockViewer?.onViewed('local:guide', 5);
      mockViewer?.onEvent({ type: 'open', storyId: 'local:empty-product' });
    });
    expect(onViewed).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('still forwards real story ids', async () => {
    const real: Story = {
      id: 'brief-1',
      kind: 'brief',
      title: 'Brief',
      tone: 'neutral',
      generatedAt: '2026-10-17T05:30:00.000Z',
      viewed: false,
      cards: [{ id: 'c1', tone: 'neutral', kicker: 'k', headline: 'h' }],
    };
    const tree = mountRow([real]);
    await act(async () => {});
    press(tree, 'brief-1');
    act(() => mockViewer?.onViewed('brief-1', 0));
    expect(onViewed).toHaveBeenCalledWith('brief-1', 0);
  });

  it('persists the Guide as viewed once it is opened and closed', async () => {
    const tree = mountRow([]);
    await act(async () => {});
    press(tree, 'local:guide');
    expect((mockViewer?.stories as Story[])[0].cards).toHaveLength(6);
    await act(async () => mockViewer?.onViewed('local:guide', 5));
    expect(await AsyncStorage.getItem(GUIDE_VIEWED_KEY)).toBe('1');
    expect(onViewed).not.toHaveBeenCalled();
  });

  it('keeps analytics away from synthetic stories', () => {
    const guide = buildGuideStory(identity, new Date(), false);
    expect(
      toEventDTO({ type: 'open', storyId: guide.id }, [guide], new Date()),
    ).toBeNull();
  });

  it('fills every missing kind in the usual order', () => {
    const all = withEmptyKinds([], identity, new Date());
    expect(all.map((s) => s.id)).toEqual([
      'local:empty-brief',
      'local:empty-clients',
      'local:empty-business',
      'local:empty-product',
    ]);
    expect(all.every((s) => s.viewed)).toBe(true);
  });
});
