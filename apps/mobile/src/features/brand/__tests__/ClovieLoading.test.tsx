import * as React from 'react';

import { act, mount } from '@/testing/render';

import { ClovieLoading } from '../ClovieLoading';
import { hideNativeSplash, resetNativeSplashForTests } from '../splash';

const mockHideAsync = jest.fn(() => Promise.resolve(true));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: () => mockHideAsync(),
}));
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View };
});

let mockReduce = false;
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  useReduceMotion: () => mockReduce,
}));

const quotes = require('@/lib/i18n/locales/en-US.json').loading
  .quotes as string[];

beforeEach(() => {
  jest.useFakeTimers();
  mockHideAsync.mockClear();
  resetNativeSplashForTests();
  mockReduce = false;
});
afterEach(() => jest.useRealTimers());

const quoteText = (tree: ReturnType<typeof mount>) =>
  tree.root.findByProps({ testID: 'clovie-quote' }).props.children;

describe('ClovieLoading', () => {
  it('is labelled as a progressbar and starts at the injected random line', () => {
    const tree = mount(<ClovieLoading random={() => 0.5} />);
    const root = tree.root.findByProps({ testID: 'clovie-loading' });
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityLabel).toBe('Loading Clovie');
    expect(quoteText(tree)).toBe(quotes[Math.floor(quotes.length * 0.5)]);
  });

  it('advances to the next line every 2.4 seconds and wraps', () => {
    const tree = mount(<ClovieLoading random={() => 0.999} />);
    expect(quoteText(tree)).toBe(quotes[quotes.length - 1]);
    act(() => {
      jest.advanceTimersByTime(2400);
    });
    expect(quoteText(tree)).toBe(quotes[0]);
  });

  it('keeps cycling under reduced motion', () => {
    mockReduce = true;
    const tree = mount(<ClovieLoading random={() => 0} />);
    act(() => {
      jest.advanceTimersByTime(2400);
    });
    expect(quoteText(tree)).toBe(quotes[1]);
  });

  it('hides the native splash after its first layout, once', () => {
    const tree = mount(<ClovieLoading random={() => 0} />);
    expect(mockHideAsync).not.toHaveBeenCalled();
    const root = tree.root.findByProps({ testID: 'clovie-loading' });
    act(() => {
      root.props.onLayout();
      root.props.onLayout();
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    hideNativeSplash();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });
});
