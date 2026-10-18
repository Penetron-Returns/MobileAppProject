const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARKER = '# --- clovie keep rules ---';
const RULES = `${MARKER}
# Clovie voice native module (Expo module, loaded by reflection and from the manifest services)
-keep class expo.modules.clovievoice.** { *; }
# ONNX Runtime (wake-word classifier) is called through JNI
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**
# Kotlin metadata for reflection-based Expo module definitions
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations
-keep class kotlin.Metadata { *; }
# --- end clovie keep rules ---
`;

/**
 * Appends keep rules to the generated android/app/proguard-rules.pro (android/ is regenerated
 * by prebuild). Idempotent. They only take effect if minification is enabled for release.
 */
function withClovieProguard(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/proguard-rules.pro',
      );
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(MARKER)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${current.trimEnd()}\n\n${RULES}`);
      }
      return cfg;
    },
  ]);
}

module.exports = withClovieProguard;
