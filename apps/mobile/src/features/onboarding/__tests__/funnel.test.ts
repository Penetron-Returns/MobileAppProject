import type { AppRoute } from '@/features/auth/appRoute';

import { revealed } from '../components/StreamedText';
import { nextFunnelState } from '../funnel';
import { LOOPS, REST, poseAt, type ClovieMood } from '../reaction';

/** Feeds route kinds in order and returns how many times the funnel completed. */
function completions(kinds: AppRoute['kind'][]): number {
  let seen = false;
  let n = 0;
  for (const kind of kinds) {
    const next = nextFunnelState(seen, kind);
    seen = next.hasSeenFirstRun;
    if (next.isCompleted) n += 1;
  }
  return n;
}

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));

describe('onboarding completion', () => {
  it.each([
    ['a full first run', ['splash', 'onboarding', 'tabs'], 1],
    [
      'a returning owner with a business never counts',
      ['splash', 'tabs', 'tabs'],
      0,
    ],
    ['staying on first run', ['onboarding', 'onboarding'], 0],
    [
      'once per first run, not per later visit',
      ['onboarding', 'tabs', 'tabs'],
      1,
    ],
  ] as [string, AppRoute['kind'][], number][])(
    '%s',
    (_label, kinds, expected) => {
      expect(completions(kinds)).toBe(expected);
    },
  );
});

describe('Clovie reactions', () => {
  const moods = Object.keys(REST) as ClovieMood[];

  it.each([
    ['curious', -7],
    ['thoughtful', -11],
  ] as const)('%s holds its tilt', (mood, deg) => {
    expect(REST[mood].rotate).toBe(deg);
    expect(poseAt(mood, 0.5).rotate).toBe(deg);
  });

  it('sympathetic leans in and does not move', () => {
    expect(REST.sympathetic).toEqual({ rotate: 7, scale: 0.9, y: 0 });
    expect(LOOPS.sympathetic).toBeNull();
    expect(poseAt('sympathetic', 0.3)).toEqual(REST.sympathetic);
  });

  it('hops 9pt up at the top of the hop and is down at rest', () => {
    expect(poseAt('proud', 0.225).y).toBeCloseTo(-9, 5);
    expect(poseAt('delighted', 0).y).toBeCloseTo(0, 5);
    expect(poseAt('delighted', 0.7).y).toBe(0);
    expect(LOOPS.delighted?.repeat).toBe(1);
  });

  it('waves a few degrees either side of upright', () => {
    expect(poseAt('excited', 0.25).rotate).toBeGreaterThan(4);
    expect(poseAt('excited', 0.75).rotate).toBeLessThan(-3.5);
    expect(LOOPS.excited).toEqual({ periodMs: 1400, repeat: -1 });
  });

  it('breathes from 1 to 1.05 over 3s', () => {
    expect(poseAt('calm', 0).scale).toBe(1);
    expect(poseAt('calm', 0.5).scale).toBeCloseTo(1.05, 5);
    expect(LOOPS.calm?.periodMs).toBe(3000);
  });

  it.each(moods)('%s is defined at every phase', (mood) => {
    for (const p of [0, 0.25, 0.5, 0.99]) {
      const pose = poseAt(mood, p);
      expect(Number.isFinite(pose.rotate + pose.scale + pose.y)).toBe(true);
    }
  });
});

describe('streamed heading', () => {
  it('shows the first words and leaves the rest for later', () => {
    expect(revealed("Salon. Lovely!\nWhat's it called?", 2)).toEqual([
      'Salon. Lovely!\n',
      "What's it called?",
    ]);
    expect(revealed('One two', 0)).toEqual(['', 'One two']);
    expect(revealed('One two', 9)).toEqual(['One two', '']);
  });
});
