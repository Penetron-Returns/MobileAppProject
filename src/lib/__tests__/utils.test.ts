import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('merges conflicting tailwind classes, keeping the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('merges conditional object syntax', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });
});
