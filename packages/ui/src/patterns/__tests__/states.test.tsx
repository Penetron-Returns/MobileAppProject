import { CalendarX } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator } from 'react-native';

import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { BlockedActionSheet } from '../states/BlockedActionSheet';
import { ErrorState } from '../states/ErrorState';
import { ListSkeleton } from '../states/ListSkeleton';
import { OfflineBanner } from '../states/OfflineBanner';
import { CenteredSpinner, EmptyState, LoadingCard } from '../states/States';
import { useOfflineGuard } from '../states/useOfflineGuard';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

// Sheets portal into a host the test renderer does not have.
jest.mock('../../components/Sheet', () => {
  const { View } = require('react-native');
  const Passthrough = ({ children }: { children?: unknown }) =>
    children ?? null;
  return {
    Sheet: ({ open, children }: { open: boolean; children?: unknown }) =>
      open ? children : null,
    SheetContent: Passthrough,
    SheetTitle: View,
    SheetDescription: View,
  };
});

describe('ErrorState', () => {
  const details = {
    message: 'Network request failed',
    requestId: 'req_9',
  };

  it.each(['banner', 'card', 'screen'] as const)(
    'announces itself as an alert in the %s variant and shows reason and reference',
    (variant) => {
      const tree = render(<ErrorState variant={variant} {...details} />);
      expect(
        tree.root.find((n) => n.props.accessibilityRole === 'alert'),
      ).toBeTruthy();
      expect(textOf(tree)).toContain('Network request failed');
      expect(textOf(tree)).toContain('Reference: req_9');
    },
  );

  it('uses calm default wording per variant', () => {
    expect(textOf(render(<ErrorState variant="banner" />))).toContain(
      "Couldn't load this.",
    );
    const card = textOf(render(<ErrorState variant="card" />));
    expect(card).toContain("Couldn't load this");
    expect(card).toContain('Check your connection and try again.');
  });

  it('lets the caller say what failed', () => {
    const tree = render(
      <ErrorState
        variant="card"
        title="Couldn't load the calendar"
        description="Pull down to try again."
      />,
    );
    expect(textOf(tree)).toContain("Couldn't load the calendar");
    expect(textOf(tree)).toContain('Pull down to try again.');
  });

  it.each(['banner', 'card', 'screen'] as const)(
    'offers one way forward in the %s variant',
    (variant) => {
      const onRetry = jest.fn();
      const tree = render(<ErrorState variant={variant} onRetry={onRetry} />);
      const retry = tree.root.find(
        (n) => n.props.accessibilityRole === 'button' && !!n.props.onPress,
      );
      act(() => retry.props.onPress());
      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );

  it('shows no button without onRetry', () => {
    const tree = render(<ErrorState variant="card" />);
    expect(
      tree.root.findAll((n) => n.props.accessibilityRole === 'button'),
    ).toHaveLength(0);
  });

  it('shows a spinner and blocks presses while retrying', () => {
    const tree = render(
      <ErrorState variant="screen" onRetry={jest.fn()} isRetrying />,
    );
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(
      byLabel(tree, 'Try again').some((n) => n.props.disabled === true),
    ).toBe(true);
  });
});

describe('OfflineBanner', () => {
  it('says what the screen is showing, as an alert', () => {
    const tree = render(
      <OfflineBanner label="Offline · showing what we had at 10:32" />,
    );
    expect(textOf(tree)).toBe('Offline · showing what we had at 10:32');
    expect(
      tree.root.find((n) => n.props.accessibilityRole === 'alert'),
    ).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('has an inline and a screen variant, with an optional action', () => {
    const inline = render(
      <EmptyState icon={CalendarX} title="Nothing here" description="Soon." />,
    );
    const screen = render(
      <EmptyState
        variant="screen"
        icon={CalendarX}
        title="No clients yet"
        action={<>{'add'}</>}
      />,
    );
    expect(textOf(inline)).toContain('Soon.');
    expect(textOf(screen)).toContain('add');
    expect(
      screen.root.find(
        (n) => n.props.role === 'heading' && n.props['aria-level'] === '2',
      ),
    ).toBeTruthy();
    expect(inline.root.findAll((n) => n.props.role === 'heading')).toHaveLength(
      0,
    );
  });
});

describe('loading states', () => {
  it('keeps ListSkeleton busy and labelled', () => {
    const tree = render(<ListSkeleton rows={3} />);
    const busy = byLabel(tree, 'Loading')[0];
    expect(busy.props.accessibilityState).toEqual({ busy: true });
  });

  it('renders a card placeholder and a centred spinner', () => {
    expect(JSON.stringify(render(<LoadingCard />).toJSON())).toBeTruthy();
    expect(
      render(<CenteredSpinner />).root.findAllByType(ActivityIndicator),
    ).toHaveLength(1);
  });
});

describe('useOfflineGuard and BlockedActionSheet', () => {
  function Harness({
    isOffline,
    recheck,
    action,
  }: {
    isOffline: boolean;
    recheck?: () => Promise<unknown>;
    action: () => void;
  }) {
    const { guard, sheetProps } = useOfflineGuard(isOffline, recheck);
    return (
      <>
        <GuardButton onPress={guard(action)} />
        <BlockedActionSheet {...sheetProps} />
      </>
    );
  }
  function GuardButton({ onPress }: { onPress: () => void }) {
    const { Pressable } = require('react-native');
    return <Pressable accessibilityLabel="go" onPress={onPress} />;
  }

  it('runs the action while online', () => {
    const action = jest.fn();
    const tree = render(<Harness isOffline={false} action={action} />);
    act(() => pressable(tree, 'go').props.onPress());
    expect(action).toHaveBeenCalled();
    expect(textOf(tree)).not.toContain("You're offline");
  });

  it('opens the sheet instead of running the action offline', () => {
    const action = jest.fn();
    const tree = render(<Harness isOffline action={action} />);
    act(() => pressable(tree, 'go').props.onPress());
    expect(action).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain("You're offline");
  });

  it('says "Still offline" when the recheck fails, and closes when it works', async () => {
    const failing = render(
      <Harness
        isOffline
        action={jest.fn()}
        recheck={() => Promise.reject(new Error('offline'))}
      />,
    );
    act(() => pressable(failing, 'go').props.onPress());
    await act(async () => {
      pressable(failing, 'Try again').props.onPress();
    });
    expect(textOf(failing)).toContain('Still offline');

    const working = render(
      <Harness
        isOffline
        action={jest.fn()}
        recheck={() => Promise.resolve()}
      />,
    );
    act(() => pressable(working, 'go').props.onPress());
    await act(async () => {
      pressable(working, 'Try again').props.onPress();
    });
    expect(textOf(working)).not.toContain("You're offline");
  });
});
