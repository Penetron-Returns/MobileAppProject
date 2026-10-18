const {
  withAndroidManifest,
  withInfoPlist,
  AndroidConfig,
} = require('expo/config-plugins');

/**
 * Hides the Expo dev menu's floating "tools" button (the grey gear at the
 * top-right of dev builds). It is part of expo-dev-menu, not Clerk, and only
 * exists in development builds; release builds do not include the dev menu.
 * The dev menu stays reachable by shaking the device or pressing `m` in Metro.
 */
module.exports = function withDevMenuNoFab(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      'EXDevMenuShowFloatingActionButton',
      'false',
    );
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.EXDevMenuShowFloatingActionButton = false;
    return cfg;
  });
};
