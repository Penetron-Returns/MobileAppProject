import * as fs from 'fs';
import * as path from 'path';

/**
 * The Reanimated jest mock runs worklets on the JS thread, so calling a plain
 * JS helper inside one passes in tests and crashes on device ("Tried to
 * synchronously call a Remote Function"). This scans the source instead.
 */
const WORKLET_HOOKS =
  /\b(useAnimatedStyle|useDerivedValue|useAnimatedProps|useAnimatedReaction|useAnimatedScrollHandler|runOnUI|scheduleOnUI)\s*\(/g;
const JS_ONLY_HELPERS = /\b(timingConfig|springConfig|staggerDelay)\s*\(/;

const ROOTS = [
  path.resolve(__dirname, '../..'),
  path.resolve(__dirname, '../../../../../apps/mobile/src'),
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules'
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** The text between the call's parentheses, matched by depth. */
function callBody(source: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')' && --depth === 0) {
      return source.slice(openIndex, i + 1);
    }
  }
  return source.slice(openIndex);
}

describe('worklet safety', () => {
  it('never calls timingConfig, springConfig or staggerDelay inside a worklet (use TIMING / SPRING)', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(WORKLET_HOOKS)) {
        const open = (match.index ?? 0) + match[0].length - 1;
        if (JS_ONLY_HELPERS.test(callBody(source, open))) {
          offenders.push(`${path.relative(process.cwd(), file)}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
