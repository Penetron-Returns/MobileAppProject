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
  jest.useFakeTimers();
  mockReduce = false;
});
afterEach(() => jest.useRealTimers());

const web = (tree: ReturnType<typeof mount>) =>
  tree.root.findAllByProps({ testID: 'clovie-webview' });
const opacity = (tree: ReturnType<typeof mount>, id: string) =>
  tree.root
    .findByProps({ testID: id })
    .props.style.flat()
    .find((s: { opacity?: number }) => s && 'opacity' in s).opacity;

const stillShown = (tree: ReturnType<typeof mount>) =>
  tree.root.findAllByProps({ testID: 'clovie-still-layer' }).length > 0;

describe('ClovieAnimated', () => {
  it('keeps the still at full opacity until ready, then fades the live layer in over it', () => {
    const tree = mount(<ClovieAnimated state="working" size={140} />);
    expect(web(tree)[0].props.source.html).toContain('"state":"working"');
    expect(stillShown(tree)).toBe(true);
    expect(opacity(tree, 'clovie-live-layer')).toBe(0);

    act(() => {
      web(tree)[0].props.onMessage({ nativeEvent: { data: 'ready' } });
    });
    // Live is fading in; the still has not started to fade yet.
    expect(opacity(tree, 'clovie-live-layer')).toBe(1);
    expect(stillShown(tree)).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(opacity(tree, 'clovie-live-layer')).toBe(1);
    expect(stillShown(tree)).toBe(false);
  });

  it('mounts the WebView only after the first content when deferred', () => {
    const tree = mount(<ClovieAnimated size={140} isDeferred />);
    expect(web(tree)).toHaveLength(0);
    expect(stillShown(tree)).toBe(true);
    act(() => {
      jest.advanceTimersByTime(5);
    });
    expect(web(tree).length).toBeGreaterThan(0);
  });

  it('hands the WebView the same source object across re-renders', () => {
    const tree = mount(<ClovieAnimated size={140} />);
    const first = web(tree)[0].props.source;
    tree.update(<ClovieAnimated size={140} />);
    expect(web(tree)[0].props.source).toBe(first);
  });

  it('loads the still without a fade', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    expect(
      tree.root.findByProps({ testID: 'clovie-still' }).props.fadeDuration,
    ).toBe(0);
  });

  it('brings the still back and remounts the WebView when its process dies', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    act(() => {
      web(tree)[0].props.onMessage({ nativeEvent: { data: 'ready' } });
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(stillShown(tree)).toBe(false);
    act(() => {
      web(tree)[0].props.onRenderProcessGone({});
    });
    expect(web(tree).length).toBeGreaterThan(0);
    expect(stillShown(tree)).toBe(true);
    expect(opacity(tree, 'clovie-live-layer')).toBe(0);
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
    expect(stillShown(tree)).toBe(true);
  });

  it('keeps the still and drops the WebView when it fails', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    act(() => {
      web(tree)[0].props.onError({});
    });
    expect(web(tree).length).toBe(0);
    expect(stillShown(tree)).toBe(true);
  });

  it('renders the still only under reduced motion', () => {
    mockReduce = true;
    const tree = mount(<ClovieAnimated state="default" size={120} />);
    expect(web(tree).length).toBe(0);
    expect(stillShown(tree)).toBe(true);
  });

  it('asks for the idle pose by default', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    expect(web(tree)[0].props.source.html).toContain('"state":"default"');
  });

  it('drops the live WebView after an idle window and brings it back after a rest', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    expect(web(tree).length).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(web(tree).length).toBe(0);
    expect(stillShown(tree)).toBe(true);
    act(() => {
      jest.advanceTimersByTime(45_000);
    });
    expect(web(tree).length).toBeGreaterThan(0);
  });

  it('never rests when the caller owns the motion', () => {
    const tree = mount(<ClovieAnimated size={120} isAlwaysLive />);
    act(() => {
      jest.advanceTimersByTime(120000);
    });
    expect(web(tree).length).toBeGreaterThan(0);
  });

  it('keeps the live WebView while working', () => {
    const tree = mount(<ClovieAnimated state="working" size={120} />);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(web(tree).length).toBeGreaterThan(0);
  });

  it('shows the still again at rest after the live canvas had fully taken over', () => {
    const tree = mount(<ClovieAnimated size={120} />);
    act(() => {
      web(tree)[0].props.onMessage({ nativeEvent: { data: 'ready' } });
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(stillShown(tree)).toBe(false);
    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(web(tree).length).toBe(0);
    expect(stillShown(tree)).toBe(true);
  });

  it('reports when the live canvas starts and stops so pulses can follow it', () => {
    const onLiveChange = jest.fn();
    mount(<ClovieAnimated size={120} onLiveChange={onLiveChange} />);
    expect(onLiveChange).toHaveBeenLastCalledWith(true);
    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(onLiveChange).toHaveBeenLastCalledWith(false);
    act(() => {
      jest.advanceTimersByTime(45_000);
    });
    expect(onLiveChange).toHaveBeenLastCalledWith(true);
  });
});
