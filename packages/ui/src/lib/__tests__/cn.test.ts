import { cn } from '../cn';

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

describe('cn with the type scale', () => {
  it.each(['large-title', 'section', 'title', 'subtitle', 'meta'])(
    'keeps text-%s next to a text colour class',
    (step) => {
      expect(cn(`text-${step}`, 'text-muted-foreground')).toBe(
        `text-${step} text-muted-foreground`,
      );
    },
  );

  it('lets a later size replace an earlier one', () => {
    expect(cn('text-base', 'text-subtitle')).toBe('text-subtitle');
  });
});

describe('cn cache', () => {
  it('returns the same merged result for repeated input', () => {
    const first = cn('p-2 p-4', 'text-title');
    expect(first).toBe('p-4 text-title');
    expect(cn('p-2 p-4', 'text-title')).toBe(first);
  });
  it('returns an empty string for no classes', () => {
    expect(cn(undefined, false, '')).toBe('');
  });
});
