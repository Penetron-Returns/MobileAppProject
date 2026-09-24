const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const escape = (p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Only the Expo app lives at the root. `backend/` and `supabase/` have their
// own toolchains, so keep Metro from crawling them. `shared/` is types-only.
config.resolver.blockList = [
  new RegExp(`^${escape(path.resolve(projectRoot, 'backend'))}[/\\\\].*`),
  new RegExp(`^${escape(path.resolve(projectRoot, 'supabase'))}[/\\\\].*`),
];

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: './tailwind.config.cjs',
});
