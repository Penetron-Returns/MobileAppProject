import * as React from 'react';

import { act, mount } from '@/testing/render';

import { ClovieLoading } from '../ClovieLoading';
import { hideNativeSplash, resetNativeSplashForTests } from '../splash';

const mockHideAsync = jest.fn(() => Promise.resolve(true));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: () => mockHideAsync(),
  setOptions: jest.fn(),
}));
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
    const root = tree.root
      .findAllByProps({ testID: 'clovie-loading' })
      .filter((n) => n.props.style)[0];
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

  it('hides the native splash once the still has loaded, once', () => {
    const tree = mount(<ClovieLoading random={() => 0} />);
    expect(mockHideAsync).not.toHaveBeenCalled();
    const still = tree.root.findByProps({ testID: 'clovie-still' });
    act(() => {
      still.props.onLoad();
      still.props.onLoad();
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    hideNativeSplash();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash after the safety timeout if the still never loads', () => {
    mount(<ClovieLoading random={() => 0} splashSafetyMs={1500} />);
    act(() => {
      jest.advanceTimersByTime(1499);
    });
    expect(mockHideAsync).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });
});

describe('ClovieLoading theme', () => {
  const { SchemeScope, getDepth } = require('@booking/ui');

  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    );
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const flat = (style: unknown) => Object.assign({}, ...[style].flat(5));

  it.each(['light', 'dark'] as const)(
    'sits on the %s ground with a primary label that clears AA',
    (scheme) => {
      const depth = getDepth(scheme);
      const tree = mount(
        <SchemeScope scheme={scheme}>
          <ClovieLoading random={() => 0} />
        </SchemeScope>,
      );
      const root = tree.root
        .findAllByProps({ testID: 'clovie-loading' })
        .filter((n) => n.props.style)[0];
      expect(flat(root.props.style).backgroundColor).toBe(
        depth.ground.backgroundColor,
      );
      const quote = tree.root.findByProps({ testID: 'clovie-quote' });
      const { color } = flat(quote.props.style);
      expect(color).toBe(depth.colors.label);
      expect(
        contrast(color, depth.ground.backgroundColor as string),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
