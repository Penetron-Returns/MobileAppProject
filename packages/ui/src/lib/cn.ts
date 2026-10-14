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

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
