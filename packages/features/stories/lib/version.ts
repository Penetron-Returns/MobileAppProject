/** Minimal semver comparison for app versions such as "1.4.0" or "v2.0" (a missing part is 0, a pre-release suffix is ignored). */

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/;

export function parseVersion(value: string): [number, number, number] | null {
  const m = VERSION_RE.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** -1, 0 or 1 like a sort comparator; null when either side is not a version. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i += 1) {
    if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1;
  }
  return 0;
}
