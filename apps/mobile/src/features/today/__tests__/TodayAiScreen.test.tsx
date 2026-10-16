import type { Approval } from '@nerova/react-native';
import * as React from 'react';

import {
  CompanionLiveProvider,
  type CompanionLive,
} from '@/features/companion/sdk/companionLive';
import { CompanionSheetControlProvider } from '@/features/companion/sdk/companionSheetControl';
import {
  act,
  flush,
  mount,
  pressableByLabel,
  pressableByText,
  text,
} from '@/testing/render';

import type { TodayAiView } from '../aiHooks';
import { buildDigest, type AiEvent } from '../aiLogic';
import { TodayAiScreen } from '../components/TodayAiScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

// The real Clovie is a WebView; here it only reports the props it was given.
const mockClovie = jest.fn();
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: (props: unknown) => {
    mockClovie(props);
    return null;
  },
}));

let mockView: TodayAiView = { status: 'loading' };
jest.mock('../aiHooks', () => ({ useTodayAi: () => mockView }));

const TZ = 'Africa/Johannesburg';
const NOW = new Date('2026-10-14T08:40:00.000Z'); // 10:40 in Johannesburg

function ready(
  overrides: Partial<Extract<TodayAiView, { status: 'ready' }>> = {},
): TodayAiView {
  return {
    status: 'ready',
    date: '2026-10-14',
    currency: 'ZAR',
    timezone: TZ,
    now: NOW,
    appointments: [],
    percent: 67,
    revenueCents: 485_000,
    clovieBooked: 3,
    digest: buildDigest([], '2026-10-14', TZ),
    nowRow: () => ({
      primary: { kind: 'calm' },
      secondary: { kind: 'next', name: 'Thandi', time: '11:00' },
    }),
    isOffline: false,
    lastUpdated: '10:32',
    refresh: jest.fn(),
    ...overrides,
  };
}

function approval(id: string, title: string): Approval {
  return {
    id,
    kind: 'cancel_appointment',
    status: 'pending',
    title,
    lines: [],
    consequences: [],
    expiresAt: null,
    decidedAt: null,
    result: null,
    error: null,
    followUp: null,
  };
}

function live(overrides: Partial<CompanionLive> = {}): CompanionLive {
  return {
    activity: 'idle',
    pending: [],
    isSheetOpen: false,
    approve: jest.fn().mockResolvedValue(null),
    decline: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function render(
  companion: CompanionLive | null = live(),
  open: () => void = jest.fn(),
) {
  return mount(
    <CompanionSheetControlProvider
      value={{ isAvailable: true, hasFailed: false, open, close: jest.fn() }}
    >
      <CompanionLiveProvider value={companion}>
        <TodayAiScreen />
      </CompanionLiveProvider>
    </CompanionSheetControlProvider>,
  );
}

beforeEach(() => {
  mockView = ready();
  jest.clearAllMocks();
});

describe('TodayAiScreen', () => {
  it('shows the busy skeleton while loading', () => {
    mockView = { status: 'loading' };
    expect(
      render().root.findAll(
        (n) => n.props.accessibilityLabel === 'Loading today',
      ),
    ).not.toHaveLength(0);
  });

  it('shows what failed with a retry on error', () => {
    mockView = { status: 'error', error: new Error('boom'), retry: jest.fn() };
    const out = text(render());
    expect(out).toContain("Couldn't load today");
    expect(out).toContain('Try again');
  });

  it('lays out the date, status, numbers and the quiet all-clear', () => {
    const out = text(render());
    expect(out).toContain('Wednesday 14 October');
    expect(out).toContain('Clovie is looking after today');
    expect(out).toContain('Next: Thandi at 11:00');
    expect(out).toContain('67%');
    expect(out).toContain('booked today');
    expect(out).toContain('R 4,850 so far · 3 booked by Clovie');
    expect(out).toContain('Nothing needs you');
    expect(out).not.toContain('Needs you ·');
    expect(out).toContain('Today so far');
    expect(out).toContain('This morning');
    expect(out).toContain('This afternoon');
  });

  it('leaves out Announcements: there is no source for them', () => {
    expect(text(render())).not.toContain('Announcements');
  });

  it('shows a dash instead of a percent when nothing is bookable today', () => {
    mockView = ready({ percent: null });
    expect(text(render())).toContain('–');
  });

  describe('Needs you', () => {
    it('shows the first pending approval as a card with its count', () => {
      const out = text(
        render(
          live({
            pending: [
              approval('a', 'Cancel Megan at 14:00?'),
              approval('b', 'Move Sam'),
            ],
          }),
        ),
      );
      expect(out).toContain('Needs you · 2');
      expect(out).toContain('Cancel Megan at 14:00?');
      expect(out).toContain('Approve');
      expect(out).toContain('Not now');
      expect(out).not.toContain('Nothing needs you');
    });

    it('approves through the SDK', async () => {
      const companion = live({ pending: [approval('a', 'Cancel Megan?')] });
      const tree = render(companion);
      act(() => {
        pressableByLabel(tree, 'Approve: Cancel Megan?').props.onPress();
      });
      await flush();
      expect(companion.approve).toHaveBeenCalledWith('a');
      expect(companion.decline).not.toHaveBeenCalled();
    });

    it('shows the companion follow-up for 3 s in place of the card, then the all-clear', async () => {
      jest.useFakeTimers();
      try {
        const pending = [approval('a', 'Move Megan?')];
        const companion = live({
          pending,
          approve: jest.fn().mockResolvedValue({
            ...pending[0],
            followUp: { text: 'Done, moved to Sat 15:00' },
          }),
        });
        const tree = render(companion);
        act(() => {
          pressableByLabel(tree, 'Approve: Move Megan?').props.onPress();
        });
        await flush();
        expect(text(tree)).toContain('Done, moved to Sat 15:00');
        expect(text(tree)).not.toContain('Needs you ·');
        act(() => {
          jest.advanceTimersByTime(3000);
        });
        expect(text(tree)).not.toContain('Done, moved to Sat 15:00');
      } finally {
        jest.useRealTimers();
      }
    });

    it('Not now keeps it waiting: moves on to the next, then to a quiet waiting line', () => {
      const companion = live({
        pending: [approval('a', 'First one'), approval('b', 'Second one')],
      });
      const tree = render(companion);
      act(() => {
        pressableByLabel(tree, 'Not now: First one').props.onPress();
      });
      expect(text(tree)).toContain('Second one');
      act(() => {
        pressableByLabel(tree, 'Not now: Second one').props.onPress();
      });
      expect(text(tree)).toContain('2 things are waiting for later');
      expect(companion.decline).not.toHaveBeenCalled();
      expect(companion.approve).not.toHaveBeenCalled();
    });
  });

  describe('Clovie', () => {
    it('opens the companion sheet when the hero is tapped', () => {
      const open = jest.fn();
      const tree = render(live(), open);
      act(() => {
        pressableByLabel(tree, 'Talk to Clovie').props.onPress();
      });
      expect(open).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('falls back to the companion route without the SDK', () => {
      const tree = mount(
        <CompanionSheetControlProvider
          value={{
            isAvailable: false,
            hasFailed: false,
            open: jest.fn(),
            close: jest.fn(),
          }}
        >
          <TodayAiScreen />
        </CompanionSheetControlProvider>,
      );
      act(() => {
        pressableByLabel(tree, 'Talk to Clovie').props.onPress();
      });
      expect(mockPush).toHaveBeenCalledWith('/companion');
    });

    it('works while the companion is busy and parks its canvas while the sheet is open', () => {
      render(live({ activity: 'busy', isSheetOpen: true }));
      expect(mockClovie).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'working', isPaused: true }),
      );
    });

    it('idles with a live canvas otherwise', () => {
      render(live());
      expect(mockClovie).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'default', isPaused: false }),
      );
    });
  });

  describe('Today so far', () => {
    const events: AiEvent[] = [
      {
        id: 'e1',
        type: 'created',
        occurred_at: '2026-10-14T06:15:00.000Z', // 08:15
        actor: 'nerova',
        appointment: {
          starts_at: '2026-10-14T13:00:00.000Z',
          client: { name: 'Megan' },
        },
      },
      {
        id: 'e2',
        type: 'cancelled',
        occurred_at: '2026-10-14T07:00:00.000Z', // 09:00
        actor: 'staff',
        appointment: {
          starts_at: '2026-10-14T14:00:00.000Z',
          client: { name: 'Sam' },
        },
      },
    ];

    it('summarises the morning and expands into a timeline', () => {
      mockView = ready({ digest: buildDigest(events, '2026-10-14', TZ) });
      const tree = render();
      expect(text(tree)).toContain('Booked 1, cancelled 1');
      expect(text(tree)).not.toContain('Booked Megan for 15:00');
      act(() => {
        pressableByText(tree, 'This morning').props.onPress();
      });
      expect(text(tree)).toContain('Booked Megan for 15:00 (Clovie)');
      expect(text(tree)).toContain("Cancelled Sam's 16:00");
    });

    it('says nothing yet for an afternoon that has not started', () => {
      expect(text(render())).toContain('Nothing yet');
    });
  });
});
