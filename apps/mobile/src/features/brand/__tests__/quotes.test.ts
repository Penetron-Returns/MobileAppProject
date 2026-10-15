import { nextQuoteIndex, pickStartIndex } from '../quotes';

describe('pickStartIndex', () => {
  it.each([
    [0, 10, 0],
    [0.5, 10, 5],
    [0.999999, 10, 9],
    [1, 10, 9],
    [0.7, 0, 0],
  ])('maps random %s over %s lines to index %s', (r, count, expected) => {
    expect(pickStartIndex(count, () => r)).toBe(expected);
  });
});

describe('nextQuoteIndex', () => {
  it.each([
    [0, 3, 1],
    [2, 3, 0],
    [0, 0, 0],
  ])('after %s of %s comes %s', (i, count, expected) => {
    expect(nextQuoteIndex(i, count)).toBe(expected);
  });
});
