import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vitest/config';

const BACKSLASH = String.fromCharCode(92);
const posix = (p: string) => p.split(BACKSLASH).join('/');
const apiRoot = posix(fileURLToPath(new URL('.', import.meta.url)));
const packagesRoot = posix(fileURLToPath(new URL('../../packages/', import.meta.url)));

/**
 * The domain packages live outside apps/api and have no node_modules of their own
 * (apps/api is not an npm workspace member), so bare npm imports from them
 * resolve against apps/api's install, like the Deno import map does at runtime.
 */
function resolveNpmFromApi(): Plugin {
  return {
    name: 'resolve-npm-from-api',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !posix(importer).startsWith(packagesRoot)) return null;
      if (!/^(@(?!booking\/)[^/]+\/[^/]+|[a-z][^/:]*)/.test(source)) return null;
      return this.resolve(source, `${apiRoot}package.json`, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [resolveNpmFromApi()],
  resolve: {
    alias: [{ find: /^@booking\/(features|companion|app-store|testing)\//, replacement: `${packagesRoot}$1/` }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    restoreMocks: true,
  },
});
