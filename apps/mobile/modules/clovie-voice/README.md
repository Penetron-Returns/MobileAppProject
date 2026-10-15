# clovie-voice

Local Expo module (Android) for "Hey Clovie": a microphone foreground service that runs an
on-device wake word, captures one command with Android's SpeechRecognizer, shows an overlay,
and hands the command to the app's JS. Design, API, setup and training: `docs/voice.md`.

## Third-party notices

The wake-word pipeline is a Kotlin port of the Swift SDK of **livekit-wakeword**
(https://github.com/livekit/livekit-wakeword), licensed under the Apache License 2.0
(`LICENSE-livekit-wakeword.txt`), Copyright LiveKit, Inc. These files are copied unmodified from
commit `fb92cb3641fedceb0bd8442409e14d1224f7fc97` into `android/src/main/assets/wakeword/`:

- `melspectrogram.onnx` and `embedding_model.onnx` (from `src/livekit/wakeword/resources/`)
- `hey_livekit.onnx` (from `examples/resources/`), the demo classifier

Sizes and SHA-256 are in `android/src/main/assets/wakeword/MANIFEST.json`. The frozen embedding
model derives from Google's speech embedding and from openWakeWord (https://github.com/dscripka/openWakeWord).

ONNX Runtime (`com.microsoft.onnxruntime:onnxruntime-android`) is MIT licensed.
