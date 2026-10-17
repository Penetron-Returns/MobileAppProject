import { compileFrames, sampleFrames } from '../keyframes';
import { composePose, EMOTIONS, poseFor, propsFor } from '../poses';

describe('emotion to props', () => {
  it.each([
    ['delighted', {}, ['sparkle1', 'sparkle2', 'sparkle3']],
    [
      'delighted',
      { isCatching: true },
      ['sparkle1', 'sparkle2', 'sparkle3', 'stars'],
    ],
    ['proud', {}, ['sparkle1', 'sparkle3', 'heart']],
    ['curious', {}, []],
    ['curious', { isSearching: true }, ['lens']],
    ['thoughtful', {}, ['question', 'drop']],
    ['sympathetic', {}, ['heart']],
    ['presenter', {}, ['sparkle2', 'sign']],
    ['sleepy', {}, ['z', 'moon']],
    ['calm', {}, []],
  ] as const)('%s %j shows %j', (emotion, options, expected) => {
    expect(propsFor(emotion, options)).toEqual(expected);
  });

  it('never shows a party popper', () => {
    for (const e of EMOTIONS) {
      expect(
        propsFor(e, { isCatching: true, isSearching: true }),
      ).not.toContain('popper');
    }
  });

  it('shows the magnifier only for curious', () => {
    for (const e of EMOTIONS) {
      const shows = propsFor(e, { isSearching: true }).includes('lens');
      expect(shows).toBe(e === 'curious');
    }
  });
});

describe('emotion to pose', () => {
  it('holds the resting pose from the board', () => {
    expect(poseFor('delighted').base.scale).toBe(1.05);
    expect(poseFor('proud').base.scale).toBe(1.08);
    expect(poseFor('curious').base).toEqual({ scale: 1, rotate: -7, tx: -3 });
    expect(poseFor('thoughtful').base.rotate).toBe(-11);
    expect(poseFor('sympathetic').base).toEqual({
      scale: 0.9,
      rotate: 7,
      tx: 4,
    });
    expect(poseFor('sleepy').base.scale).toBe(0.96);
  });

  it('uses the board loop durations', () => {
    expect(EMOTIONS.map((e) => poseFor(e).loopMs)).toEqual([
      1900, 2800, 3200, 4200, 4800, 1400, 5000, 0,
    ]);
  });

  it('dims and half-closes the eyes only when sleepy', () => {
    for (const e of EMOTIONS) {
      expect(poseFor(e).isDimmed).toBe(e === 'sleepy');
      expect(poseFor(e).lidRest).toBe(e === 'sleepy' ? 0.5 : 0);
    }
  });

  it('adds the loop on top of the base', () => {
    const p = composePose(poseFor('curious').base, {
      tx: 0,
      ty: -2,
      rot: -3,
      sx: 1,
      sy: 1,
    });
    expect(p).toEqual({ tx: -3, ty: -2, rot: -10, sx: 1, sy: 1 });
  });
});

describe('keyframe sampling', () => {
  const frames = compileFrames([
    { at: 0, ty: 0 },
    { at: 0.5, ty: -10 },
    { at: 1, ty: 0 },
  ]);

  it('hits the stops exactly', () => {
    expect(sampleFrames(frames, 0).ty).toBe(0);
    expect(sampleFrames(frames, 0.5).ty).toBe(-10);
    expect(sampleFrames(frames, 1).ty).toBe(0);
  });

  it('eases between stops and leaves unnamed properties at identity', () => {
    const mid = sampleFrames(frames, 0.25);
    expect(mid.ty).toBeCloseTo(-5, 5);
    expect(mid.sx).toBe(1);
    expect(mid.op).toBe(1);
  });

  it('interpolates a property only between the stops that name it', () => {
    const f = compileFrames(
      [
        { at: 0, rot: 0 },
        { at: 0.5, op: 0.5 },
        { at: 1, rot: 90 },
      ],
      { isLinear: true },
    );
    expect(sampleFrames(f, 0.5).rot).toBeCloseTo(45, 5);
  });
});
