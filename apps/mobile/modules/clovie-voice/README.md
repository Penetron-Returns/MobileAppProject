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

## In-app voice (the companion drawer)

When the app is open and in the foreground, a wake does not show the system overlay. The service routes the
interaction to the in-app surface (`VoiceSurface.kt`, chosen by `VoiceRouting.surfaceFor(isForeground, isUiAttached)`)
and emits module events; `src/features/voice/inApp/` draws them in a drawer. Capture, transcription, cues, speech and
follow-up are the same native code in both modes. Outside the foreground, or with no drawer attached, the overlay is
used as before.

- Presence: `setAppForeground(bool)` (JS AppState, plus the Expo activity callbacks) and `setVoiceUiAttached(bool)`.
- Events: `onVoiceState({ state: 'listening' | 'thinking' | 'speaking' | 'waiting' | 'idle', level? })` (levels at
  ~15 Hz, only while listening), `onVoiceTranscript({ text })`, `onVoiceOutcome({ status, message, pendingApprovalId, pendingKind, pendingTitle, ... })`.
- Buttons: `stopListening`, `cancel` (drops the request and listens again), `endVoice` (closes), `listenAgain`
  (mic) and `answerApproval(id, 'yes' | 'no')`, which applies only to the approval the service is holding.
