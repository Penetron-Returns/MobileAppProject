const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');

const META = 'si.nerova.clovie.voice.';
const SERVICES = [
  // The microphone foreground service that listens for the wake word.
  {
    name: 'expo.modules.clovievoice.VoiceService',
    extra: { 'android:foregroundServiceType': 'microphone' },
  },
  // Runs the app's headless JS task for a spoken command.
  { name: 'expo.modules.clovievoice.VoiceCommandTaskService', extra: {} },
];
/** Where a trained classifier is dropped (relative to apps/mobile). */
const CUSTOM_CLASSIFIER = 'assets/voice/hey_clovie.onnx';
const BUNDLED_NAME = 'wakeword/hey_clovie.onnx';

const PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.POST_NOTIFICATIONS',
  // Keeps the CPU awake while the screen is off so the wake word still fires.
  'android.permission.WAKE_LOCK',
  // The two light haptic ticks of the entrance.
  'android.permission.VIBRATE',
  // "Display over other apps": the overlay window that is the voice UI. The owner grants it in system settings.
  'android.permission.SYSTEM_ALERT_WINDOW',
];

/**
 * Adds "Hey Clovie" to the Android build: the permissions, the microphone foreground service,
 * the headless-task service, the speech-recogniser package query, and `<meta-data>` the native
 * module reads. If `assets/voice/hey_clovie.onnx` exists it is copied into the app's assets and
 * used instead of the bundled demo classifier (hey_livekit.onnx), so training the real wake word
 * needs no code change.
 */
function withClovieVoice(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    AndroidConfig.Permissions.ensurePermissions(manifest, PERMISSIONS);

    // Android 11+ package visibility for SpeechRecognizer.
    manifest.manifest.queries = manifest.manifest.queries ?? [];
    const queries = manifest.manifest.queries;
    const hasRecognitionQuery = queries.some((q) =>
      (q.intent ?? []).some((i) =>
        (i.action ?? []).some(
          (a) => a.$['android:name'] === 'android.speech.RecognitionService',
        ),
      ),
    );
    if (!hasRecognitionQuery) {
      queries.push({
        intent: [
          {
            action: [
              { $: { 'android:name': 'android.speech.RecognitionService' } },
            ],
          },
        ],
      });
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service ?? [];
    for (const { name, extra } of SERVICES) {
      if (app.service.some((s) => s.$['android:name'] === name)) continue;
      app.service.push({
        $: { 'android:name': name, 'android:exported': 'false', ...extra },
      });
    }

    const hasCustomClassifier = fs.existsSync(
      path.join(cfg.modRequest.projectRoot, CUSTOM_CLASSIFIER),
    );
    const meta = {
      DEEP_LINK_SCHEME: Array.isArray(config.scheme)
        ? config.scheme[0]
        : (config.scheme ?? 'bookingadmin'),
      WAKE_PHRASE: hasCustomClassifier ? 'Hey Clovie' : 'Hey LiveKit',
    };
    if (hasCustomClassifier) meta.CLASSIFIER = BUNDLED_NAME;
    for (const [key, value] of Object.entries(meta)) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        app,
        META + key,
        value,
      );
    }
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const source = path.join(cfg.modRequest.projectRoot, CUSTOM_CLASSIFIER);
      if (fs.existsSync(source)) {
        const target = path.join(
          cfg.modRequest.platformProjectRoot,
          'app/src/main/assets',
          BUNDLED_NAME,
        );
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
      return cfg;
    },
  ]);
}

module.exports = withClovieVoice;
