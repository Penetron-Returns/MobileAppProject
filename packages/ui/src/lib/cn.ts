import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `twMerge` that knows the design system's type scale. Without this it reads
 * `text-subtitle` as a text colour and drops it when a colour class
 * (`text-muted-foreground`) follows, losing the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['large-title', 'section', 'title', 'subtitle', 'meta'] },
      ],
    },
  },
});

/** Merged results by their joined class string: the same few strings render all day. */
const cache = new Map<string, string>();
const CACHE_LIMIT = 1000;

export function cn(...inputs: ClassValue[]) {
  const joined = clsx(inputs);
  if (!joined) return '';
  const hit = cache.get(joined);
  if (hit !== undefined) return hit;
  const merged = twMerge(joined);
  // Dynamic class strings are rare; a hard cap keeps memory bounded.
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(joined, merged);
  return merged;
}
