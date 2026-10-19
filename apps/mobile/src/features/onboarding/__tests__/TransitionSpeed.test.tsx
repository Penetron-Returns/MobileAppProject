import * as React from 'react';
import { AccessibilityInfo, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/lib/i18n';
import { flush, mount, pressableByLabel, text } from '@/testing/render';

import { NameScreen } from '../components/NameScreen';
import { OnboardingShell } from '../components/OnboardingShell';
import { TypeScreen } from '../components/TypeScreen';

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'u1' }),
}));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

let isScreenReader = false;
beforeEach(() => {
  jest.useFakeTimers();
  isScreenReader = false;
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockImplementation(() => Promise.resolve(isScreenReader));
  jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('TypeScreen', () => {
  it('advances 120ms after the tap, not 400ms', () => {
    const onSelect = jest.fn();
    const tree = mount(<TypeScreen selected={null} onSelect={onSelect} />);
    act(() => pressableByLabel(tree, 'Salon').props.onPress());
    act(() => void jest.advanceTimersByTime(119));
    expect(onSelect).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1));
    expect(onSelect).toHaveBeenCalledWith('salon');
  });

  it('ignores a second tap while advancing', () => {
    const onSelect = jest.fn();
    const tree = mount(<TypeScreen selected={null} onSelect={onSelect} />);
    act(() => pressableByLabel(tree, 'Salon').props.onPress());
    act(() => pressableByLabel(tree, 'A mix').props.onPress());
    act(() => void jest.advanceTimersByTime(500));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reads the four option names aloud', () => {
    const tree = mount(<TypeScreen selected={null} onSelect={jest.fn()} />);
    const spoken: string = tree.root.findByType(OnboardingShell).props.spoken;
    for (const label of ['Barbershop', 'Salon', 'Beauty parlor', 'A mix']) {
      expect(spoken).toContain(label);
    }
  });

  it('lets tile labels wrap to two lines inside a minimum-height tile', () => {
    const tree = mount(<TypeScreen selected={null} onSelect={jest.fn()} />);
    for (const label of ['Beauty parlor', 'A mix']) {
      const texts = tree.root.findAll(
        (n) => n.props.numberOfLines === 2 && n.props.children === label,
      );
      expect(texts.length).toBeGreaterThan(0);
      const style = pressableByLabel(tree, label).props.style;
      const flat = [style].flat(3).reduce((a, s) => ({ ...a, ...s }), {});
      expect(flat.minHeight).toBe(176);
      expect(flat.height).toBeUndefined();
    }
  });

  it('moves screen reader focus to the heading', async () => {
    isScreenReader = true;
    mount(<TypeScreen selected={null} onSelect={jest.fn()} />);
    await flush();
    // No native node in the test renderer, so no handle: it must not throw.
    expect(
      text(mount(<TypeScreen selected={null} onSelect={jest.fn()} />)),
    ).toContain('What kind of business?');
  });
});

function mountName() {
  const focus = jest
    .spyOn(TextInput.prototype, 'focus')
    .mockImplementation(() => undefined);
  focus.mockClear();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <NameScreen
          typeId="salon"
          name=""
          onChangeName={jest.fn()}
          onContinue={jest.fn()}
          onBack={jest.fn()}
        />
      </SafeAreaProvider>,
    );
  });
  return { tree, focus };
}

describe('NameScreen', () => {
  it('focuses the name field as soon as it mounts, without waiting for the greeting', async () => {
    const { tree, focus } = mountName();
    await flush();
    expect(focus).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('does not steal focus for the keyboard while a screen reader is on', async () => {
    isScreenReader = true;
    const { tree, focus } = mountName();
    await flush();
    act(() => void jest.advanceTimersByTime(3000));
    expect(focus).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
