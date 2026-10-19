import AsyncStorage from '@react-native-async-storage/async-storage';

import { SAMPLE_STORIES } from '@/features/stories/sampleStories';
import { act, mount, pressableByLabel } from '@/testing/render';

import { StoriesRow } from '../components/StoriesRow';
import { resetGuideStore } from '../guideStore';

const mockOpen = jest.fn();
let mockSetup: { done: number; total: number; open: () => void } | null = null;
jest.mock('@/features/setup-checklist/useSetupStory', () => ({
  useSetupStory: () => mockSetup,
}));

let mockSettled = true;
jest.mock('../useAfterInteractions', () => ({
  useAfterInteractions: () => mockSettled,
}));

function row() {
  return mount(
    <StoriesRow
      stories={SAMPLE_STORIES}
      isLoading={false}
      onViewed={jest.fn()}
      onEvent={jest.fn()}
      onAction={jest.fn()}
      onClose={jest.fn()}
    />,
  );
}

const labels = (tree: ReturnType<typeof row>) =>
  tree.root
    .findAll((n) => n.props.accessibilityRole === 'button' && !!n.props.onPress)
    .map((n) => n.props.accessibilityLabel as string)
    .filter((l, i, all) => all.indexOf(l) === i);

const settle = () => act(async () => {});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetGuideStore();
  mockSetup = null;
  mockSettled = true;
});

describe('StoriesRow', () => {
  it('does not flex: a horizontal ScrollView grows by default and would stretch the ring hit areas down the screen', () => {
    mockSetup = { done: 4, total: 7, open: mockOpen };
    const tree = row();
    const scroll = tree.root.findAllByProps({ testID: 'stories-row' })[0];
    expect(scroll.props.style).toMatchObject({ flexGrow: 0 });
  });

  it('puts the unseen Guide first, then Get set up, then Brief, for an owner with items left', async () => {
    mockSetup = { done: 4, total: 7, open: mockOpen };
    const tree = row();
    await settle();
    const all = labels(tree);
    expect(all[0]).toBe('Guide, new');
    expect(all[1]).toBe('Get set up, 4 of 7 done');
    expect(all[2]).toMatch(/^Brief/);
    expect(all.filter((l) => l.startsWith('Get set up'))).toHaveLength(1);
  });

  it('keeps Get set up right after the Guide when every story is viewed but setup is incomplete', async () => {
    mockSetup = { done: 6, total: 7, open: mockOpen };
    const viewed = SAMPLE_STORIES.map((s) => ({ ...s, viewed: true }));
    const tree = mount(
      <StoriesRow
        stories={viewed}
        isLoading={false}
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await settle();
    expect(labels(tree)[1]).toBe('Get set up, 6 of 7 done');
  });

  it('removes Get set up, with no placeholder, once setup is complete', async () => {
    mockSetup = null;
    const tree = row();
    await settle();
    const all = labels(tree);
    expect(all.some((l) => /set up/i.test(l))).toBe(false);
    expect(all[0]).toBe('Guide, new');
    expect(all[1]).toMatch(/^Brief/);
  });

  it('opens the full checklist on tap', () => {
    mockSetup = { done: 4, total: 7, open: mockOpen };
    const tree = row();
    act(() =>
      pressableByLabel(tree, 'Get set up, 4 of 7 done').props.onPress(),
    );
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('shows no Get set up bubble for staff or once everything is done', () => {
    expect(labels(row()).some((l) => l.startsWith('Get set up'))).toBe(false);
  });

  it('still shows the bubble when there are no stories', async () => {
    mockSetup = { done: 0, total: 7, open: mockOpen };
    const tree = mount(
      <StoriesRow
        stories={[]}
        isLoading={false}
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await settle();
    expect(labels(tree)).toEqual([
      'Guide, new',
      'Get set up, 0 of 7 done',
      'Brief, viewed',
      'Client updates, viewed',
      'Business update, viewed',
      "What's new, viewed",
    ]);
  });

  it('shows quiet placeholder rings for all four kinds when there is nothing at all', async () => {
    const tree = mount(
      <StoriesRow
        stories={[]}
        isLoading={false}
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await settle();
    expect(labels(tree).slice(0, 4)).toEqual([
      'Guide, new',
      'Brief, viewed',
      'Client updates, viewed',
      'Business update, viewed',
    ]);
    expect(
      tree.root.findAllByProps({ testID: 'stories-row' }).length,
    ).toBeGreaterThan(0);
  });

  it('fills only the kinds the backend left out', async () => {
    const onlyBrief = SAMPLE_STORIES.filter((s) => s.kind === 'brief');
    const tree = mount(
      <StoriesRow
        stories={onlyBrief}
        isLoading={false}
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await settle();
    const all = labels(tree);
    expect(all[0]).toBe('Guide, new');
    expect(all[1]).toMatch(/^Brief/);
    expect(all.slice(2, 5)).toEqual([
      'Client updates, viewed',
      'Business update, viewed',
      "What's new, viewed",
    ]);
  });

  it('puts the Guide ring last, after product updates, once it was viewed', async () => {
    await AsyncStorage.setItem('clovie.guide.viewed.v1', '1');
    const tree = row();
    await settle();
    const all = labels(tree);
    expect(all[all.length - 1]).toBe('Guide, viewed');
    expect(all[all.length - 2]).toMatch(/^Product updates/);
  });

  it('keeps the Guide ring hidden until its stored state is known', () => {
    expect(labels(row()).some((l) => l.startsWith('Guide'))).toBe(false);
  });

  it('shows the Guide as viewed once it was opened on this device', async () => {
    await AsyncStorage.setItem('clovie.guide.viewed.v1', '1');
    const tree = row();
    await settle();
    expect(labels(tree).pop()).toBe('Guide, viewed');
  });

  it('mounts the checklist bubble (and so its queries) only after the first screen settles', () => {
    mockSettled = false;
    mockSetup = { done: 4, total: 7, open: mockOpen };
    expect(labels(row()).some((l) => l.startsWith('Get set up'))).toBe(false);
  });

  it('reserves the same fixed height while loading and once loaded', () => {
    const heightOf = (tree: ReturnType<typeof row>, id: string) => {
      const node = tree.root.findByProps({ testID: id });
      let parent = node.parent;
      while (parent && !(parent.props.style && parent.props.style.height)) {
        parent = parent.parent;
      }
      return parent?.props.style.height;
    };
    const loading = mount(
      <StoriesRow
        stories={[]}
        isLoading
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    mockSetup = null;
    const loaded = row();
    expect(heightOf(loading, 'stories-skeleton')).toBe(
      heightOf(loaded, 'stories-row'),
    );
  });

  it('shows an inline retry row, not a blank, when the load failed', () => {
    const onRetry = jest.fn();
    const tree = mount(
      <StoriesRow
        stories={[]}
        isLoading={false}
        isError
        onRetry={onRetry}
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'stories-error' }).length,
    ).toBeGreaterThan(0);
    act(() => pressableByLabel(tree, 'Retry').props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
