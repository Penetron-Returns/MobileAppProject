import { mount } from '@/testing/render';
import { SAMPLE_STORIES } from '@/features/stories/sampleStories';

import { StoriesRow } from '../components/StoriesRow';

describe('StoriesRow', () => {
  it('does not flex: a horizontal ScrollView grows by default and would stretch the ring hit areas down the screen', () => {
    const tree = mount(
      <StoriesRow
        stories={SAMPLE_STORIES}
        isLoading={false}
        onViewed={jest.fn()}
        onEvent={jest.fn()}
        onAction={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const row = tree.root.findAllByProps({ testID: 'stories-row' })[0];
    expect(row.props.style).toMatchObject({ flexGrow: 0 });
  });
});
