import * as React from 'react';

import { act, mount } from '@/testing/render';

import { ClovieCharacter } from '../ClovieCharacter';

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View };
});

let mockReduce = false;
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  useReduceMotion: () => mockReduce,
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockReduce = false;
});
afterEach(() => {
  jest.useRealTimers();
});

const webviews = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll(
    (n) => n.props.testID === 'clovie-webview' && typeof n.type === 'string',
  );
const lids = (tree: ReturnType<typeof mount>) =>
  tree.root.findAll((n) => n.props.testID === 'clovie-lid');

describe('ClovieCharacter', () => {
  it('schedules nothing at rest', () => {
    mount(<ClovieCharacter emotion="delighted" isLive />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('draws the static image, with no eyelids and no WebView, when not active', () => {
    const tree = mount(<ClovieCharacter emotion="curious" isLive />);
    expect(webviews(tree)).toHaveLength(0);
    expect(lids(tree)).toHaveLength(0);
  });

  it('stays static while active unless live is asked for', () => {
    const tree = mount(<ClovieCharacter emotion="curious" isActive />);
    expect(webviews(tree)).toHaveLength(0);
  });

  it('draws the real companion while active and live', () => {
    const tree = mount(<ClovieCharacter emotion="curious" isActive isLive />);
    expect(webviews(tree)).toHaveLength(1);
    expect(lids(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('asks the working companion for the presenter and the idle one otherwise', () => {
    const presenter = mount(
      <ClovieCharacter emotion="presenter" isActive isLive />,
    );
    expect(webviews(presenter)[0].props.source.html).toContain(
      '"state":"working"',
    );
    const calm = mount(<ClovieCharacter emotion="calm" isActive isLive />);
    expect(webviews(calm)[0].props.source.html).toContain('"state":"default"');
  });

  it('shows only the static image with Reduce Motion on', () => {
    mockReduce = true;
    const tree = mount(<ClovieCharacter emotion="proud" isActive isLive />);
    expect(webviews(tree)).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('hides itself from screen readers', () => {
    const tree = mount(<ClovieCharacter emotion="sleepy" testID="clovie" />);
    const node = tree.root.findAll(
      (n) => n.props.testID === 'clovie' && typeof n.type === 'string',
    )[0];
    expect(node.props.accessibilityElementsHidden).toBe(true);
  });
});
