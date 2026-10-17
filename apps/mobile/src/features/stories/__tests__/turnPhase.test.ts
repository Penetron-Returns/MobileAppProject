import { cardFill, faceOpacity, turnPhase } from '../turnPhase';

/** The turn timeline for transition n runs from n - 1 to n, in small steps. */
const steps = (n: number) =>
  Array.from({ length: 21 }, (_, i) => n - 1 + i / 20);

describe('turn phase: no flash of the old card', () => {
  it('leaves a settled face fully in, before and after later transitions begin', () => {
    // A face committed for transition n-1 sits at phase 1 while turn runs n-1 -> n.
    for (let n = 1; n <= 4; n++) {
      for (const turn of steps(n)) {
        expect(turnPhase(turn, n - 1)).toBe(1);
      }
    }
  });

  it('starts every transition with the outgoing face fully visible and the incoming one hidden', () => {
    for (let n = 1; n <= 4; n++) {
      const start = n - 1;
      expect(faceOpacity('out', turnPhase(start, n))).toBe(1);
      expect(faceOpacity('in', turnPhase(start, n))).toBe(0);
    }
  });

  it('is continuous across the state commit: the old card looks the same just before and just after', () => {
    for (let n = 1; n <= 4; n++) {
      // Before the commit the old face is the settled `in` face of transition n-1.
      const before = faceOpacity('in', turnPhase(n - 1, n - 1));
      // After the commit it is the `out` face of transition n, turn not started yet.
      const after = faceOpacity('out', turnPhase(n - 1, n));
      expect(after).toBe(before);
    }
  });

  it('never brings the old card back up once it has begun to leave', () => {
    for (let n = 1; n <= 4; n++) {
      let last = 1;
      for (const turn of steps(n)) {
        const o = faceOpacity('out', turnPhase(turn, n));
        expect(o).toBeLessThanOrEqual(last);
        last = o;
        if (turn > n - 1) expect(o).toBeLessThan(1);
      }
      expect(last).toBe(0);
    }
  });

  it('only ever brings the new card up', () => {
    for (let n = 1; n <= 4; n++) {
      let last = 0;
      for (const turn of steps(n)) {
        const o = faceOpacity('in', turnPhase(turn, n));
        expect(o).toBeGreaterThanOrEqual(last);
        last = o;
      }
      expect(last).toBe(1);
    }
  });

  it('shows the first face fully before any transition', () => {
    expect(turnPhase(0, 0)).toBe(1);
  });
});

describe('progress handoff', () => {
  it('fills the current segment from 0 to 1 over its serial', () => {
    expect(cardFill(3, 3)).toBe(0);
    expect(cardFill(3.5, 3)).toBe(0.5);
    expect(cardFill(4, 3)).toBe(1);
  });

  it('shows the new segment empty from the commit until its timer starts, whatever the old fill was', () => {
    // The old card was at 60% of serial 2. Committing serial 3 changes nothing
    // until the layout effect sets progress to 3, so the new segment reads 0.
    expect(cardFill(2.6, 3)).toBe(0);
    expect(cardFill(3, 3)).toBe(0);
  });

  it('keeps the old segment steady until the commit', () => {
    expect(cardFill(2.6, 2)).toBeCloseTo(0.6, 5);
  });
});
