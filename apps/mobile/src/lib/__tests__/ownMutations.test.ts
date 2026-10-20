import {
  isOwnEchoLikely,
  noteMutationSettled,
  noteMutationStart,
  resetOwnMutations,
} from '../ownMutations';

beforeEach(resetOwnMutations);

describe('own mutation echoes', () => {
  it('is quiet when nothing was written', () => {
    expect(isOwnEchoLikely(10_000)).toBe(false);
  });
  it('expects an echo while a write is in flight', () => {
    noteMutationStart();
    expect(isOwnEchoLikely(10_000)).toBe(true);
  });
  it('expects an echo for a moment after a write settles, then not', () => {
    noteMutationStart();
    noteMutationSettled(10_000);
    expect(isOwnEchoLikely(11_999)).toBe(true);
    expect(isOwnEchoLikely(12_000)).toBe(false);
  });
});
