import { keyboardAvoidingBehavior } from '../keyboard';

describe('keyboardAvoidingBehavior', () => {
  it.each([
    ['ios', 'padding'],
    ['android', 'padding'],
    ['web', undefined],
  ] as const)('on %s it is %s', (os, expected) => {
    expect(keyboardAvoidingBehavior(os)).toBe(expected);
  });
});
