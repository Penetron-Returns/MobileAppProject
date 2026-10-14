import { shouldClearCache, type SessionScope } from '../session';

const scope = (userId: string | null, orgId: string | null): SessionScope => ({
  userId,
  orgId,
});

describe('shouldClearCache', () => {
  it.each([
    ['first render, nobody signed in', null, scope(null, null), false],
    ['signing in from signed out', scope(null, null), scope('u1', null), false],
    [
      'activating the first business',
      scope('u1', null),
      scope('u1', 'o1'),
      false,
    ],
    ['nothing changed', scope('u1', 'o1'), scope('u1', 'o1'), false],
    ['signing out', scope('u1', 'o1'), scope(null, null), true],
    [
      'signing out before a business was active',
      scope('u1', null),
      scope(null, null),
      true,
    ],
    ['a different user signs in', scope('u1', 'o1'), scope('u2', 'o1'), true],
    [
      'switching to another business',
      scope('u1', 'o1'),
      scope('u1', 'o2'),
      true,
    ],
    ['leaving the business', scope('u1', 'o1'), scope('u1', null), true],
  ])('%s', (_name, previous, next, expected) => {
    expect(shouldClearCache(previous, next)).toBe(expected);
  });
});
