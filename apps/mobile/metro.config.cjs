const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

// `@booking/ui` is an npm workspace package (packages/ui): Metro has to watch
// its source, and its imports (react-native, nativewind, ...) resolve from the
// hoisted node_modules at the workspace root.
config.watchFolders = [
  ...new Set([
    ...(config.watchFolders ?? []),
    path.resolve(workspaceRoot, 'packages/ui'),
  ]),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: './tailwind.config.cjs',
});
