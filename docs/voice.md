# "Hey Clovie" voice commands (Android demo)

The owner says "Hey Clovie" with the phone locked or the app in the background, then a short command. Android only for this demo. iOS and web report "not supported" and hide the Settings row.

- "Hey Clovie, client has arrived" checks in the client whose appointment is due now.
- "Hey Clovie, anything else" shows the request in a panel with an **Open Clovie** button. Tapping it opens the companion sheet with what was said.

## How it works

```
Hey Clovie ──▶ foreground service (microphone) ──▶ wake word (3 ONNX models, on device)
                      │ detected
                      ├─ earcon + overlay window: "listening", glow follows the mic level
                      ├─ Android SpeechRecognizer (on-device, en-ZA then en-US) ──▶ transcript
                      ├─ headless JS task ──▶ parse ──▶ check-in through the app's API client
                      └─ overlay: "Checked in Sipho" (2 s)   or   [Open Clovie] button
```

| Piece | Where |
| --- | --- |
| Native module (Kotlin): service, wake-word engine, overlay, headless bridge | `apps/mobile/modules/clovie-voice/android/` |
| JS API of the module | `apps/mobile/modules/clovie-voice/src/` |
| Overlay page (HTML/JS, placeholder visual) | `apps/mobile/modules/clovie-voice/overlay/`, built into `android/src/main/assets/overlay/overlay.html` by `node scripts/build-voice-overlay.mjs` (output is committed) |
| Config plugin (manifest entries, classifier copy) | `apps/mobile/plugins/with-clovie-voice.js` (listed in `app.json`) |
| Command parser, appointment pick | `apps/mobile/src/features/voice/{logic,checkIn}.ts` |
| Headless task and its tested core | `src/features/voice/{headlessTask,headless}.ts` (registered in `src/app/_layout.tsx`) |
| Deep link route, used when the owner opens the app | `src/app/(app)/voice.tsx` (`bookingadmin://voice?text=...`) |
| Settings toggle | Settings > Customize > Hey Clovie (`src/features/voice/components/VoiceSettingsScreen.tsx`) |
| "You said" banner in the companion | `src/features/companion/components/HeardBanner.tsx` |

### Wake word: livekit-wakeword on ONNX Runtime

[livekit-wakeword](https://github.com/livekit/livekit-wakeword) (Apache-2.0) has Python, Rust and Swift SDKs but no Android one, so `WakeWordEngine.kt` is a port of the Swift SDK's `WakeWordModel.predict` and `WakeWordListener` onto `com.microsoft.onnxruntime:onnxruntime-android:1.30.0`. No licence key, no account, no network.

1. `melspectrogram.onnx`: 2 s of 16 kHz audio to mel frames, rescaled `x / 10 + 2`.
2. `embedding_model.onnx`: windows of 76 mel frames, stride 8, to 96-dim embeddings.
3. The classifier: the last 16 embeddings to a score. A score of at least 0.5 (configurable) fires once, then a 2 s cooldown applies.

The listener keeps a 2 s ring buffer of microphone audio and runs the pipeline about every 160 ms. The two frozen models and the demo classifier are bundled as Android assets; `wakeword/MANIFEST.json` records their sizes, SHA-256 and source commit.

Until a "hey clovie" classifier is trained, the app uses the pre-trained `hey_livekit.onnx`, so the whole flow works today by saying **"Hey LiveKit"**. The Settings screen shows the phrase the build was configured for.

### Android constraints, and what we do about them

- **A microphone foreground service cannot start from the background** (Android 12+). The toggle starts it while the app is on screen. If the system stops it (reboot, force-stop), opening Settings > Hey Clovie restarts it when the saved preference is on.
- **An app cannot start an activity from the background** (Android 10+). So the voice UI is an overlay window ("Display over other apps", `SYSTEM_ALERT_WINDOW`), and the app only opens on a tap on the overlay's button, which is a user gesture. Without the permission, results come as a heads-up notification (tap to open). We do not use full-screen intents.
- **The overlay is the only thing on screen** while talking. It ignores touches until a button is shown, so it does not block the app underneath.
- **Running a command with the app in the background** uses a headless JS task. It only has a signed-in session when the app's UI has run since launch (Clerk hands its token getter to the data layer then). On a cold start with no UI it answers `open_app`, and the owner taps **Open Clovie**; the `/voice` route finishes the check-in with the full app.

## Overlay page API

The native side drives the page with `evaluateJavascript`. The visual design is a placeholder (a bottom glow that rises with the mic level) and is meant to be replaced; keep the API.

| Call | Meaning |
| --- | --- |
| `setState('listening' \| 'processing' \| 'done' \| 'error' \| 'idle')` | phase |
| `setLevel(0..1)` | mic level at ~30 Hz, smoothed from the recogniser's RMS (`LevelMeter`) |
| `setTranscript(text)` | what the owner said |
| `setMessage(text)` | the outcome ("Checked in Sipho") |
| `setAction(label \| null)` | shows a button; a tap calls `ClovieOverlayBridge.onAction()` |

The window is full width, 40% of the screen high, bottom-anchored. Edit `modules/clovie-voice/overlay/`, then run `node scripts/build-voice-overlay.mjs` in `apps/mobile` and commit the generated asset.

## Native module API (`apps/mobile/modules/clovie-voice`)

```ts
isSupported(): boolean                       // false on iOS, web and builds without the module
getStatus(): { status, error, wakePhrase }   // status: off | not_configured | starting | listening | busy | error
start({ classifierPath?, threshold? }): Promise<state>   // call only while the app is on screen
stop(): state
addStatusListener(cb): () => void            // "onStatusChange" events
canDrawOverlays(): boolean
requestOverlayPermission(): void             // opens Settings > Display over other apps
getTimings(): Record<string, number | null>  // wakeToOverlayMs, wakeToSttStartMs, sttMs, commandMs, totalMs
completeCommand(id, { status, message })     // used by the headless task
```

Errors: `permission_denied`, `background_start_blocked`, `model_load_failed`, `audio_failed`, `inference_failed`.

`not_configured` means the bundled models are missing from the build.

## Timings

Every interaction logs these to logcat under the tag `ClovieVoice` (no transcripts, no names) and keeps the last values for `getTimings()`:

- `wakeToOverlayMs`: wake word detected to the overlay window being added (the page is preloaded).
- `wakeToSttStartMs`: detected to the recogniser listening (includes a 350 ms earcon pause).
- `sttMs`: recogniser started to final result.
- `commandMs`: transcript handed to JS to the outcome shown.
- `totalMs`: detected to outcome.

```
adb logcat -s ClovieVoice
```

## Setup for Colin

Nothing to sign up for. Build a new dev client and say "Hey LiveKit":

1. `cd apps/mobile && npx expo prebuild --platform android` (or an EAS development build). The plugin adds the permissions, services and queries.
2. Install, open Settings > Customize > Hey Clovie, switch it on, accept the microphone and notification prompts, and allow "Display over other apps" when Android opens that screen.
3. Lock the phone or switch apps and say "Hey LiveKit, client has arrived".

Test on a real phone. The on-device recogniser needs the offline English speech pack (Settings > Google > Speech, or "Offline speech recognition" in Android settings).

### Training "Hey Clovie"

The classifier is the only thing to replace. When `apps/mobile/assets/voice/hey_clovie.onnx` exists at prebuild, the plugin copies it into the app and the phrase becomes "Hey Clovie". No code changes.

1. **Config.** Copy `configs/prod.yaml` from the livekit-wakeword repo to `configs/hey_clovie.yaml` and change:
   ```yaml
   model_name: hey_clovie
   target_phrases: ["hey clovie", "hey clovey", "hey clovi"]
   custom_negative_phrases: ["clovie", "hey clover", "hey cloudy", "hey cloe", "hey groovy", "hey lovie", "clover", "hey movie"]
   model:
     model_type: conv_attention
     model_size: small
   n_samples: 25000
   target_fp_per_hour: 0.2
   ```
   Piper TTS (the default backend) synthesises the training audio, so no recordings are needed. Add spelling variants and sound-alike negatives for anything the phone mishears.
2. **Machine.** Training wants a GPU. Options: Google Colab (a T4 runs a small config), a rented GPU, or SkyPilot with the repo's `skypilot/train.yaml`, which asks for 1x L40S (`MODEL_NAME` and `CONFIG_FILE` are its env vars; the file mounts a Nebius bucket for outputs, so change that for your cloud).
3. **Run** (from the repo, after `sudo apt install espeak-ng libsndfile1 ffmpeg sox portaudio19-dev` and `uv sync --all-extras`):
   ```
   uv run livekit-wakeword setup configs/hey_clovie.yaml     # models and background data
   uv run livekit-wakeword run configs/hey_clovie.yaml       # generate, augment, train, export, eval
   ```
   or the stages one by one: `generate`, `augment`, `train`, `export`, `eval`. The result is `output/hey_clovie/hey_clovie.onnx` plus a DET plot and `hey_clovie_eval.json`.
4. **Check the numbers.** Target **FPPH < 0.5** (false activations per hour of non-wake-word audio) with good recall. The evaluator also reports the optimal threshold. If it is not 0.5, pass it: `start({ threshold })`, or change `DEFAULT_THRESHOLD` in `WakeWordEngine.kt`.
5. **Drop it in:** save the file as `apps/mobile/assets/voice/hey_clovie.onnx` and rebuild the dev client.

Expect to iterate: more `n_samples`, more sound-alike negatives, a bigger `model_size`, then test with real voices (South African accents especially; the frozen embedding model is trained mostly on English data).

## Privacy (POPIA)

- The microphone listens on the phone for the wake word only. The wake-word models run on the device; audio is not saved or sent.
- After the wake word, one command is turned into text by the phone's own recogniser (on-device where the phone has the offline pack). The text goes to Clovie only when the owner's command needs it (the check-in call, or opening the companion).
- Android shows a "Clovie is listening" notification with a Stop button the whole time.
- Off by default; the consent text on the Settings screen and in the permission dialog says all of this before any permission is requested.

## Licences

- livekit-wakeword code and the two frozen models (`melspectrogram.onnx`, `embedding_model.onnx`) and the demo classifier `hey_livekit.onnx`: Apache-2.0, Copyright LiveKit, Inc. See `apps/mobile/modules/clovie-voice/README.md` and `LICENSE-livekit-wakeword.txt`. The frozen embedding model derives from Google's speech embedding and openWakeWord; check their terms before a commercial release.
- ONNX Runtime: MIT.
- No Picovoice or other licence key is involved.

## Not verified yet

The Kotlin has not been compiled or run on a device (no native build was allowed). First things to check on a phone: that the app builds, the status reaches "listening", the overlay appears over another app, the recogniser accepts `en-ZA`, and the headless task reaches JS with the app in the background.

## iOS

Out of scope for the demo. The route on iOS is Siri App Shortcuts (App Intents): a "Check in my client" shortcut the owner can trigger with "Hey Siri, check in my client in Clovie". iOS does not allow a third-party always-on wake word, so "Hey Clovie" itself is Android only. livekit-wakeword's Swift SDK could power an in-app listener, but only while the app is open.
