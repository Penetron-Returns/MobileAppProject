import * as React from 'react';

import { setAnalytics } from '@/features/analytics';
import {
  createFakeAnalytics,
  type FakeAnalytics,
} from '@/features/analytics/testing';
import { act, mount, pressableByLabel, text } from '@/testing/render';

import {
  CompanionSetupScreen,
  SLOW_AFTER_MS,
} from '../components/CompanionSetupScreen';
import { InactiveBusinessScreen } from '../components/InactiveBusinessScreen';
import { PayFailedScreen } from '../components/PayFailedScreen';
import { PayingScreen } from '../components/PayingScreen';
import { ProgressDots } from '../components/ProgressDots';
import { ReplayVoiceButton } from '../components/ReplayVoiceButton';
import { TypeScreen } from '../components/TypeScreen';

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));
const mockSignOut = jest.fn();
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => mockSignOut,
}));
const mockRefetch = jest.fn();
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => ({ refetch: mockRefetch, isFetching: false }),
}));
const mockSpeak = jest.fn();
jest.mock('@/lib/speech', () => ({
  speak: (...a: unknown[]) => mockSpeak(...a),
  stopSpeaking: jest.fn(),
}));

let fake: FakeAnalytics;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  fake = createFakeAnalytics();
  setAnalytics(fake);
});
afterEach(() => {
  jest.useRealTimers();
  setAnalytics();
});

const ADVANCE = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

describe('ProgressDots', () => {
  it.each([
    [1, ['active', 'todo', 'todo'], 'Step 1 of 3'],
    [2, ['done', 'active', 'todo'], 'Step 2 of 3'],
    [3, ['done', 'done', 'active'], 'Step 3 of 3'],
  ] as const)('stage %s draws three dots', (stage, states, label) => {
    const tree = mount(<ProgressDots stage={stage} />);
    const dots = tree.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('dot-'),
    );
    expect(dots.map((d) => d.props.testID.replace('dot-', ''))).toEqual(states);
    const flat = (d: (typeof dots)[number]) =>
      Object.assign({}, ...[d.props.style].flat());
    expect(dots.map((d) => flat(d).width)).toEqual(
      states.map((s) => (s === 'active' ? 20 : 8)),
    );
    expect(flat(dots[0]).height).toBe(8);
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === label).length,
    ).toBeGreaterThan(0);
  });
});

describe('ReplayVoiceButton', () => {
  it('is a quiet 44pt icon that reads the line aloud', () => {
    const tree = mount(<ReplayVoiceButton text="Hello" />);
    const button = pressableByLabel(tree, "Replay Clovie's voice");
    const style = Object.assign({}, ...[button.props.style].flat());
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    act(() => button.props.onPress());
    expect(mockSpeak).toHaveBeenCalledWith('Hello', expect.anything());
  });

  it('reads once on arrival when asked to', () => {
    mount(<ReplayVoiceButton text="Hi" autoSpeak />);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });
});

describe('PayingScreen', () => {
  it('confirms the payment and always offers "I didn\'t pay"', () => {
    const onNotPaid = jest.fn();
    const tree = mount(<PayingScreen isPaid={false} onNotPaid={onNotPaid} />);
    expect(text(tree)).toContain('Confirming your payment...');
    expect(text(tree)).toContain('This takes a few seconds.');
    act(() => pressableByLabel(tree, "I didn't pay").props.onPress());
    expect(onNotPaid).toHaveBeenCalled();
  });

  it('says Paid once it lands', () => {
    const tree = mount(<PayingScreen isPaid onNotPaid={jest.fn()} />);
    expect(text(tree)).toContain('Paid');
  });
});

describe('PayFailedScreen', () => {
  const open = (
    kind: 'cancelled' | 'failed' | 'offline' | 'unconfirmed' | 'not_configured',
  ) => {
    const fns = { again: jest.fn(), check: jest.fn(), other: jest.fn() };
    const tree = mount(
      <PayFailedScreen
        phase={{ kind }}
        onTryAgain={fns.again}
        onCheckAgain={fns.check}
        onPickAnother={fns.other}
      />,
    );
    return { tree, ...fns };
  };

  it('says calmly that it did not go through and nothing was charged', () => {
    const { tree, again, other } = open('failed');
    expect(text(tree)).toContain("That didn't go through.");
    expect(text(tree)).toContain("You haven't been charged.");
    act(() => pressableByLabel(tree, 'Try again').props.onPress());
    act(() => pressableByLabel(tree, 'Pick another plan').props.onPress());
    expect(again).toHaveBeenCalled();
    expect(other).toHaveBeenCalled();
  });

  it('never claims "not charged" while a payment may still land, and offers to check again', () => {
    const { tree, check } = open('unconfirmed');
    expect(text(tree)).not.toContain("haven't been charged");
    act(() => pressableByLabel(tree, 'Check again').props.onPress());
    expect(check).toHaveBeenCalled();
  });

  it.each(['offline', 'not_configured'] as const)(
    '%s keeps its own message',
    (kind) => {
      expect(text(open(kind).tree)).not.toContain("That didn't go through.");
    },
  );
});

describe('CompanionSetupScreen', () => {
  it('says Clovie is getting ready, lists the checks and reports it', () => {
    const tree = mount(<CompanionSetupScreen />);
    const out = text(tree);
    expect(out).toContain('Getting me ready...');
    expect(out).toContain('Just a few seconds.');
    for (const step of ['Your hours', 'Your services', 'Your calendar']) {
      expect(out).toContain(step);
    }
    expect(() => pressableByLabel(tree, 'Try again')).toThrow();
    expect(fake.names()).toEqual(['setup_waiting_shown']);
  });

  it('ticks the first checks off about 900ms apart', () => {
    const tree = mount(<CompanionSetupScreen />);
    const checked = () =>
      tree.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityState?.checked === true,
      ).length;
    expect(checked()).toBe(0);
    ADVANCE(900);
    expect(checked()).toBe(1);
    ADVANCE(900);
    expect(checked()).toBe(2);
  });

  it('admits when it is slow and offers a retry', () => {
    const tree = mount(<CompanionSetupScreen />);
    ADVANCE(SLOW_AFTER_MS + 10);
    expect(text(tree)).toContain('Taking longer than usual');
    act(() => pressableByLabel(tree, 'Try again').props.onPress());
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe('InactiveBusinessScreen', () => {
  it('tells staff to ask the owner, and lets them sign out', () => {
    const tree = mount(<InactiveBusinessScreen />);
    const out = text(tree);
    expect(out).toContain("Your business isn't active yet");
    expect(out).toContain('Ask the owner to choose a plan.');
    act(() => pressableByLabel(tree, 'Sign out').props.onPress());
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe('TypeScreen', () => {
  it('renders every tile label in full, including "A mix"', () => {
    const tree = mount(<TypeScreen selected={null} onSelect={jest.fn()} />);
    for (const label of ['Barbershop', 'Salon', 'Beauty parlor', 'A mix']) {
      expect(text(tree)).toContain(label);
    }
  });
});
