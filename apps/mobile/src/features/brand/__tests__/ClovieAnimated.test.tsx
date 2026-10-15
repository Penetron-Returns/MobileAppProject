import * as React from 'react';

import { act, mount } from '@/testing/render';

import { ClovieAnimated } from '../ClovieAnimated';

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
  mockReduce = false;
});

const web = (tree: ReturnType<typeof mount>) =>
  tree.root.findAllByProps({ testID: 'clovie-webview' });
const opacity = (tree: ReturnType<typeof mount>, id: string) =>
  tree.root
    .findByProps({ testID: id })
    .props.style.flat()
    .find((s: { opacity?: number }) => s && 'opacity' in s).opacity;

describe('ClovieAnimated', () => {
  it('shows the still until the page reports ready, then cross-fades to the live canvas', () => {
    const tree = mount(<ClovieAnimated state="working" size={140} />);
    expect(web(tree)[0].props.source.html).toContain('"state":"working"');
    expect(opacity(tree, 'clovie-still-layer')).toBe(1);
    expect(opacity(tree, 'clovie-live-layer')).toBe(0);

    act(() => {
      web(tree)[0].props.onMessage({ nativeEvent: { data: 'ready' } });
    });
    expect(opacity(tree, 'clovie-still-layer')).toBe(0);
    expect(opacity(tree, 'clovie-live-layer')).toBe(1);
  });

  it('calls onReady once the page reports its first paint', () => {
    const onReady = jest.fn();
    const tree = mount(<ClovieAnimated size={120} onReady={onReady} />);
    act(() => {
      web(tree)[0].props.onMessage({ nativeEvent: { data: 'ready' } });
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('ignores other messages from the page', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    act(() => {
      web(tree)[0].props.onMessage({ nativeEvent: { data: 'hello' } });
    });
    expect(opacity(tree, 'clovie-still-layer')).toBe(1);
  });

  it('keeps the still and drops the WebView when it fails', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    act(() => {
      web(tree)[0].props.onError({});
    });
    expect(web(tree)).toHaveLength(0);
    expect(opacity(tree, 'clovie-still-layer')).toBe(1);
  });

  it('renders the still only under reduced motion', () => {
    mockReduce = true;
    const tree = mount(<ClovieAnimated state="default" size={120} />);
    expect(web(tree)).toHaveLength(0);
    expect(opacity(tree, 'clovie-still-layer')).toBe(1);
  });

  it('asks for the idle pose by default', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    expect(web(tree)[0].props.source.html).toContain('"state":"default"');
  });
});
