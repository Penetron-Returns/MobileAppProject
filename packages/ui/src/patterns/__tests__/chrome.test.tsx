import * as React from 'react';

import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { BackPill } from '../BackPill';
import { FlowCaption, FlowFooter, FlowHeading, FlowTopBar } from '../Flow';
import { Page } from '../Page';
import { SaveFooter } from '../SaveFooter';
import { Screen } from '../Screen';
import { StackHeader } from '../StackHeader';

const mockRouter = {
  canGoBack: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};
let mockPathname = '/';
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => mockRouter.canGoBack(),
    back: () => mockRouter.back(),
    replace: (href: string) => mockRouter.replace(href),
  },
  usePathname: () => mockPathname,
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
});

describe('BackPill', () => {
  it('goes back when there is history', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const tree = render(<BackPill label="Today" />);
    act(() => pressable(tree, 'Today').props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('falls back to the given route without history', () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const tree = render(<BackPill label="Clients" fallback="/clients" />);
    act(() => pressable(tree, 'Clients').props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/clients');
  });

  it('says "Back" by default and lets the flow override the action', () => {
    const onPress = jest.fn();
    const tree = render(<BackPill onPress={onPress} />);
    act(() => pressable(tree, 'Back').props.onPress());
    expect(onPress).toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('StackHeader', () => {
  it('renders the title as a heading with a labelled back button', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const tree = render(<StackHeader title="Cancel booking" />);
    expect(tree.root.find((n) => n.props.role === 'heading')).toBeTruthy();
    expect(textOf(tree)).toContain('Cancel booking');
    act(() => pressable(tree, 'Back').props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows a Close button instead in the close variant', () => {
    const onBack = jest.fn();
    const tree = render(<StackHeader title="Edit" close onBack={onBack} />);
    act(() => pressable(tree, 'Close').props.onPress());
    expect(onBack).toHaveBeenCalled();
    expect(byLabel(tree, 'Back')).toHaveLength(0);
  });

  it('hides the button with hideBack and shows right content', () => {
    const tree = render(
      <StackHeader title="Home" hideBack right={<>{'bell'}</>} />,
    );
    expect(byLabel(tree, 'Back')).toHaveLength(0);
    expect(textOf(tree)).toContain('bell');
  });
});

describe('Page', () => {
  it('shows the large title as the screen heading, with caption, right control and footer', () => {
    const tree = render(
      <Page
        title="Today"
        caption="Wednesday 14 October"
        titleRight={<>{'bell'}</>}
        footer={<>{'pinned'}</>}
      >
        {'content'}
      </Page>,
    );
    const heading = tree.root.find(
      (n) => n.props.role === 'heading' && n.props['aria-level'] === '1',
    );
    expect(heading).toBeTruthy();
    const text = textOf(tree);
    for (const part of [
      'Today',
      'Wednesday 14 October',
      'bell',
      'pinned',
      'content',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('shows the back pill only for pushed screens', () => {
    const pushed = render(
      <Page title="Client" backLabel="Clients">
        {null}
      </Page>,
    );
    const root = render(<Page title="Clients">{null}</Page>);
    expect(byLabel(pushed, 'Clients').length).toBeGreaterThan(0);
    expect(
      root.root.findAll((n) => n.props.accessibilityRole === 'button'),
    ).toHaveLength(0);
  });

  it('wires pull to refresh through onRefresh', async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const tree = render(
      <Page title="Today" onRefresh={onRefresh}>
        {null}
      </Page>,
    );
    const control = tree.root.find(
      (n) => typeof n.props.onRefresh === 'function' && 'refreshing' in n.props,
    );
    await act(async () => {
      control.props.onRefresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('leaves room for the tab bar and Inbox dome on tab screens', () => {
    const paddings = (isTab: boolean) => {
      const tree = render(
        <Page title="Today" isTab={isTab}>
          {null}
        </Page>,
      );
      const scroll = tree.root.find(
        (n) =>
          n.props.contentContainerStyle &&
          'paddingBottom' in n.props.contentContainerStyle,
      );
      return scroll.props.contentContainerStyle.paddingBottom as number;
    };
    expect(paddings(true)).toBeGreaterThan(paddings(false));
  });
});

describe('Screen', () => {
  it('renders header, content and footer', () => {
    const tree = render(
      <Screen header={<>{'header'}</>} footer={<>{'footer'}</>}>
        {'content'}
      </Screen>,
    );
    for (const part of ['header', 'content', 'footer']) {
      expect(textOf(tree)).toContain(part);
    }
  });

  it('clears the floating tab bar only on top-level tab screens', () => {
    const bottoms = (pathname: string) => {
      mockPathname = pathname;
      const tree = render(<Screen>{'content'}</Screen>);
      const scroll = tree.root.find(
        (n) =>
          'contentContainerStyle' in n.props &&
          n.props.refreshControl === undefined,
      );
      return scroll.props.contentContainerStyle?.paddingBottom as
        number | undefined;
    };
    expect(bottoms('/calendar')).toBeGreaterThan(0);
    expect(bottoms('/bookings/1')).toBeUndefined();
  });
});

describe('SaveFooter', () => {
  it('is a labelled primary action and respects disabled', () => {
    const onPress = jest.fn();
    const tree = render(<SaveFooter label="Save changes" onPress={onPress} />);
    act(() => pressable(tree, 'Save changes').props.onPress());
    expect(onPress).toHaveBeenCalled();
    const off = render(
      <SaveFooter label="Save changes" disabled onPress={onPress} />,
    );
    expect(pressable(off, 'Save changes').props.disabled).toBe(true);
  });
});

describe('flow chrome', () => {
  it('reports progress as a progressbar value', () => {
    const tree = render(
      <FlowTopBar
        value={2}
        max={4}
        progressLabel="Step 2 of 4"
        showBack={false}
        onBack={jest.fn()}
      />,
    );
    const bar = byLabel(tree, 'Step 2 of 4').find(
      (n) => n.props.accessibilityRole === 'progressbar',
    )!;
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 4, now: 2 });
  });

  it('clamps the progress fill between empty and full', () => {
    const fill = (value: number, max: number) => {
      const tree = render(
        <FlowTopBar
          value={value}
          max={max}
          progressLabel="p"
          showBack={false}
          onBack={jest.fn()}
        />,
      );
      const styles = tree.root
        .findAll((n) => typeof n.type === 'string')
        .flatMap((n) => [n.props.style].flat(3) as { width?: unknown }[]);
      return styles.find((s) => s && typeof s.width === 'string')?.width;
    };
    expect(fill(2, 4)).toBe('50%');
    expect(fill(9, 4)).toBe('100%');
    expect(fill(-1, 4)).toBe('0%');
    expect(fill(1, 0)).toBe('0%');
  });

  it('shows a back button only when asked to', () => {
    const onBack = jest.fn();
    const withBack = render(
      <FlowTopBar
        value={1}
        max={3}
        progressLabel="p"
        showBack
        onBack={onBack}
      />,
    );
    act(() => pressable(withBack, 'Back').props.onPress());
    expect(onBack).toHaveBeenCalled();
    const without = render(
      <FlowTopBar
        value={1}
        max={3}
        progressLabel="p"
        showBack={false}
        onBack={onBack}
      />,
    );
    expect(byLabel(without, 'Back')).toHaveLength(0);
  });

  it('renders heading, subtitle, caption and footer content', () => {
    const tree = render(
      <>
        <FlowHeading
          title="Your hours"
          subtitle="When can clients book?"
          align="center"
        />
        <FlowCaption>You can change this later.</FlowCaption>
        <FlowFooter>{'continue'}</FlowFooter>
      </>,
    );
    const text = textOf(tree);
    for (const part of [
      'Your hours',
      'When can clients book?',
      'You can change this later.',
      'continue',
    ]) {
      expect(text).toContain(part);
    }
    expect(tree.root.find((n) => n.props.role === 'heading')).toBeTruthy();
  });
});
