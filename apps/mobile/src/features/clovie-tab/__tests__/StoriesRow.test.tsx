import { SAMPLE_STORIES } from '@/features/stories/sampleStories';
import { act, mount, pressableByLabel } from '@/testing/render';

import { StoriesRow } from '../components/StoriesRow';

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

beforeEach(() => {
  jest.clearAllMocks();
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

  it('puts Get set up right after Business update for an owner with items left', () => {
    mockSetup = { done: 4, total: 7, open: mockOpen };
    const all = labels(row());
    const business = all.findIndex((l) => l.startsWith('Business update'));
    expect(all[business + 1]).toBe('Get set up, 4 of 7 done');
    expect(all[business + 2]).toMatch(/^Product updates/);
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

  it('still shows the bubble when there are no stories', () => {
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
    expect(labels(tree)).toEqual(['Get set up, 0 of 7 done']);
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
