# Clovie voice (Android demo)

Two ways to talk to Clovie from anywhere on the phone. Android only for this demo. iOS and web report "not supported" and hide the Settings row.

1. **Talk to Clovie (the default, one tap).** No always-on microphone. Tap the Quick Settings tile, the home-screen button, the app-icon shortcut or the side key; Clovie's overlay appears and listens for one command. The microphone is open only while the owner speaks.
2. **Hands-free "Hey Clovie" (opt-in).** The wake word listens on the phone, only inside conditions the owner picks (opening hours and/or while charging). Off by default, switched on in Settings > Clovie voice.

Both end the same way:

- "client has arrived" checks in the client whose appointment is due now.
- Anything else goes to the real Nerova companion (Clovie) and the reply is spoken, with the app closed. See [Ask Clovie by voice](#ask-clovie-by-voice). **Open Clovie** is only for real failures, such as no session or token.

## How it works

```
one-tap:    tile / widget / shortcut / side key ─▶ VoiceTalkActivity (transparent) ─▶ foreground service
hands-free: opening hours + charger + pause ─▶ foreground service ─▶ voice gate ─▶ wake word (3 ONNX models)
                      │ (one-tap starts here; hands-free: wake word detected)
                      ├─ wake chime + haptic tick + overlay window with the cinematic entrance, mic opens at once
                      ├─ Android SpeechRecognizer (on-device, en-ZA then en-US, live partials) ──▶ transcript
                      ├─ headless JS task ──▶ parse ──▶ check-in through the app's API client
                      └─ success/failure cue, reply read aloud; overlay: "Checked in Sipho" (2 s, or until spoken)   or   [Open Clovie] button, then the exit; one-tap service stops
```

### One-tap entry points

All of them land on `VoiceTalkActivity`, a transparent activity that starts the microphone foreground service while an activity is on screen (the only time Android 12+ allows it) and finishes at once, so the phone returns to whatever the owner was doing. First use without the microphone permission opens Settings > Clovie voice instead.

| Entry | How it is set up |
| --- | --- |
| Quick Settings tile "Talk to Clovie" | `VoiceTileService`. Settings has **Add tile** (Android 13+ asks the system; older phones: Quick Settings > Edit > drag it in). The tile opens the activity with `startActivityAndCollapse`, so the shade closes. |
| Home-screen button | `VoiceWidgetProvider`, a 1x1 widget: touch and hold the home screen > Widgets > Clovie. |
| App-icon shortcut | A dynamic shortcut "Talk to Clovie", published when the app starts: touch and hold the Clovie icon. (The brief said static; dynamic needs no hard-coded package in a resource file and looks the same.) |
| Samsung side key | See below. |
| Deep link | `bookingadmin://voice/listen` starts listening and goes back (it needs the app to open, so prefer the entries above). |

**Samsung side key.** One UI lets the owner pick an app for the side button, but it lists apps by their launcher entry. Settings > Clovie voice > **Show a Clovie Voice icon** turns on a second launcher icon, "Clovie Voice" (an activity alias of `VoiceTalkActivity`, disabled until the owner asks). Then on the phone: Settings > Advanced features > Side button > Double press > Open app > **Clovie Voice**. A double press then goes straight into listening with the overlay and returns to the previous app. Samsung may also offer app shortcuts in that picker, where "Talk to Clovie" appears.

| Piece | Where |
| --- | --- |
| Native module (Kotlin): service, wake-word engine, overlay, headless bridge | `apps/mobile/modules/clovie-voice/android/` |
| JS API of the module | `apps/mobile/modules/clovie-voice/src/` |
| Overlay page (HTML/JS, placeholder visual) | `apps/mobile/modules/clovie-voice/overlay/`, built into `android/src/main/assets/overlay/overlay.html` by `node scripts/build-voice-overlay.mjs` (output is committed) |
| Config plugin (manifest entries, classifier copy) | `apps/mobile/plugins/with-clovie-voice.cjs` (listed in `app.json`) |
| Command parser, appointment pick | `apps/mobile/src/features/voice/{logic,checkIn}.ts` |
| Headless task and its tested core | `src/features/voice/{headlessTask,headless}.ts` (registered in `src/app/_layout.tsx`) |
| Deep link routes | `src/app/(app)/voice/index.tsx` (`bookingadmin://voice?text=...`, finishes a command in the app) and `voice/listen.tsx` (`bookingadmin://voice/listen`) |
| Settings screen "Clovie voice" | Settings > Customize > Clovie voice: `src/features/voice/components/{VoiceSettingsScreen,OneTapSection,HandsFreeSection}.tsx` |
| On-duty rule (pure, tested) | `src/features/voice/duty.ts` (`dutyWindows`, `evaluateDuty`); mirrored by `HandsFreePolicy.kt` |
| Opening windows for the native side | `src/features/voice/scheduleSync.ts`: the next 14 days of hours and special days in the business timezone, pushed when the app opens |
| Entry points (Kotlin) | `VoiceTalkActivity`, `VoiceTileService`, `VoiceWidgetProvider`, the `ClovieVoiceLauncher` alias, declared in the module's `AndroidManifest.xml` |
| Hands-free re-arming (Kotlin) | `HandsFreePolicy`, `HandsFreeController`, `HandsFreeReceiver`, `SpeechGate` |
| "You said" banner in the companion | `src/features/companion/components/HeardBanner.tsx` |

### Wake word: livekit-wakeword on ONNX Runtime

[livekit-wakeword](https://github.com/livekit/livekit-wakeword) (Apache-2.0) has Python, Rust and Swift SDKs but no Android one, so `WakeWordEngine.kt` is a port of the Swift SDK's `WakeWordModel.predict` and `WakeWordListener` onto `com.microsoft.onnxruntime:onnxruntime-android:1.30.0`. No licence key, no account, no network.

1. `melspectrogram.onnx`: 2 s of 16 kHz audio to mel frames, rescaled `x / 10 + 2`.
2. `embedding_model.onnx`: windows of 76 mel frames, stride 8, to 96-dim embeddings.
3. The classifier: the last 16 embeddings to a score. A score of at least 0.5 (configurable) fires once, then a 2 s cooldown applies.

The listener keeps a 2 s ring buffer of microphone audio and runs the pipeline about every 160 ms. The two frozen models and the demo classifier are bundled as Android assets; `wakeword/MANIFEST.json` records their sizes, SHA-256 and source commit.

Until a "hey clovie" classifier is trained, the app uses the pre-trained `hey_livekit.onnx`, so the whole flow works today by saying **"Hey LiveKit"**. The Settings screen shows the phrase the build was configured for.

### Hands-free: conditions, the voice gate, and re-arming

**Conditions** (combinable): always (both off), **only during opening hours** (the default when switched on: the business's weekly hours with special days and closures, in the business timezone), **only while charging**. The app computes the next 14 days of opening windows (`dutyWindows`) and stores them natively; the service, the alarm receiver and the boot receiver decide from those with the app closed. If the windows run out (the app was not opened for two weeks) it reads "Off until the next opening. Open Clovie to refresh."

**Outside its conditions** the service closes the microphone completely (no recording, so no microphone indicator), releases the wake lock and shows "Clovie is off duty, on duty again at 08:00" (or "Waiting for the charger", "Paused until 14:10"). The notification while on duty is "Clovie is on duty: listening for 'Hey Clovie'" with **Pause (1 h)** and **Stop**.

**How it re-arms.** The foreground service stays alive (idle, no recording) between periods, so re-arming never has to start a microphone service from the background:

- Opening/closing time and the end of a pause: an inexact alarm (`setAndAllowWhileIdle`, no special permission; opening can slip a few minutes in Doze) wakes `HandsFreeReceiver`, which tells the running service to re-check. We used `setAndAllowWhileIdle` instead of `setWindow`, because a window alarm is deferred to a Doze maintenance window, which can be hours late.
- The charger: a power-connected/disconnected receiver registered by the running service (these broadcasts cannot be declared in the manifest).

**If the service is gone** (reboot, the system or the user killed it, an app update), `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED` and the alarm try to start it, and when Android refuses they post "Clovie is ready for opening hours. Tap to start listening", whose tap starts it (a tap is a user gesture). What Android permits, to the best of my knowledge (not all verified on the device):

| Start from | Microphone foreground service |
| --- | --- |
| Foreground app / a visible activity (toggle, tile, widget, shortcut, side key) | Allowed, with microphone access. |
| A notification tap, widget or tile click | Allowed (a user gesture; our entry points go through `VoiceTalkActivity`). |
| An exact alarm | The start is exempt, but a microphone service started from the background gets no microphone access (the "while-in-use" rule), so it would record silence. We do not rely on it. |
| `BOOT_COMPLETED` | Not allowed for microphone services on Android 15 and later; attempted anyway, replaced by the notification. |
| A power-connected broadcast | Not exempt, and cannot be a manifest receiver. Only the running service listens for it. |

**Voice gate.** Before the wake-word models, a cheap energy gate (`SpeechGate`) decides whether speech is likely: a chunk's level against an adaptive noise floor, with a 2.2 s hangover. The three ONNX models run only while it is open (about every 160 ms); in silence they do not run at all. The 2 s ring buffer keeps filling regardless, so the start of "Hey..." is already in it (2 s of pre-roll) when the gate opens. Trade-off: it is an energy gate, not a neural VAD. It opens on any loud sound (a door, a dryer), which costs a few model runs, and a very quiet voice far from the phone could be gated out. Silero VAD (MIT, about 2 MB, also an ONNX model) would cut the false opens; it is a follow-up because it needs its own streaming state and tuning on device.

**Wake lock.** A partial wake lock is held only while the microphone is open (on duty), and released in standby. We cannot also release it between sounds while on duty: with the screen off the CPU would sleep, the audio stream would stall and wake words would be missed. So the saving comes from the conditions and the gate, not from dropping the lock.

### Sounds and spoken replies (accessibility)

The owner may not be able to read the overlay (dyslexia) or may have her hands full, so every state has a sound and the reply is read aloud. Both are settings in Settings > Clovie voice > Replies, on by default, stored natively (`VoiceFeedbackSettings`, read by the service with no JS running).

| State | Cue (all synthesized in `VoiceCues.kt`, nothing bundled) |
| --- | --- |
| Wake | A5 then E6, a bright rising fifth, 300 ms (the entrance timing), with the two haptic ticks |
| Processing | D5 then G5, a quiet rising fourth, 260 ms, when listening ends. After 1.5 s of waiting, a very faint D5 pulse every 1.6 s until the result arrives |
| Success | C5, E5, G5 rising major triad with a warm tail, 560 ms |
| Failure, "didn't catch that", nothing to do | G4 down to D4, a soft falling fifth, pure sine, 460 ms |

Sounds use `USAGE_ASSISTANT` (the system stream behind `USAGE_ASSISTANCE_SONIFICATION` is muted in vibrate mode) and play at normal and vibrate ringer modes. They are silent only in total silence (ringer silent, or Do Not Disturb set to "total silence"). The system "touch sounds" setting no longer gates them.

With "Read replies aloud" on, the service reads the outcome with the phone's own text-to-speech (offline; English South Africa, else en-GB, else the default voice), after the cue, holding transient audio focus that lets other audio duck. The overlay stays up until the speech ends or its usual time, whichever is later (12 s watchdog). The `open_app` outcome is never read verbatim (it carries the transcript, which can hold a client name): it says "I need the app for that. Tap Open Clovie." Message text is never logged.

### Ask Clovie by voice

With the app closed, any request except "client has arrived" (the fast local path) is sent to the owner's Nerova companion, and the reply is read aloud. This is how a dyslexic owner runs the day eyes-free.

**API** (Clerk or device voice token; feature `companion`; `Idempotency-Key` required). The server mints a native companion session (`NEROVA_NATIVE_SESSIONS=true` is required, else `COMPANION_NOT_READY`), caches it per business and user for its lifetime minus 60 s, calls `POST /v1/companion/chat`, parses the stream fully, and on `companion.session_expired` retries once with a new session. Code: `packages/companion/nerova/{chatStream,chatClient,httpChatClient,voiceAsk}.ts`, route `apps/api/src/routes/v1/voiceAsk.ts`.

| Route | Body | `data` |
| --- | --- | --- |
| `POST /v1/voice/ask` | `{ text }` (1 to 4000) | `{ reply, approvals: [{ id, kind, title, lines }], suggestions }` |
| `POST /v1/voice/approvals/:id/approve` | none | `{ id, decision: 'approved', kind }` |
| `POST /v1/voice/approvals/:id/decline` | none | `{ id, decision: 'declined', kind }` |

Nerova problem codes map to our codes: `account_not_ready` to `COMPANION_NOT_READY`, `request.rate_limited` to `RATE_LIMITED`, `approval.not_found` to `NOT_FOUND`, `approval.expired` to `WINDOW_CLOSED`, `approval.already_decided` and `approval.connector_conflict` to `RULE_VIOLATION`, everything else (including an in-stream `companion.turn_failed`) to `UPSTREAM_COMPANION_ERROR` with `details.nerova_code`. The text, reply and titles are never logged.

**Approvals are read one at a time, and a yes or no is bound to one id.** Owner bookings, moves and cancels come back as approvals. The outcome carries `pendingApprovalId` (the one just read aloud), `pendingKind` and `pendingQueue` (the rest, as JSON). The service echoes them with the next turn, so "yes" calls approve on exactly that id, never "the latest pending". With several approvals, each yes or no applies to the one just read, then the next is read. The spoken title keeps the client, service, date and time (`speakableApproval`: "Fri 16 Oct, 20:30-21:15" is read "Friday 16 October at 20:30 to 21:15"), followed by "Say yes or no."

**Follow-up listening, with no wake word.** When an outcome has `expectsReply` (an approval is waiting, or the reply ends with a question mark), the service speaks, plays the wake cue softly, and captures another clip with the same `ClipCapture` and VAD (6 s without speech ends it quietly). The overlay keeps the reply text and shows "listening". The clip is transcribed and runs as a follow-up turn:

- yes (yes, yeah, yep, sure, ok, okay, confirm, do it, go ahead, please): approve; "Done. Booked." / "Done. Moved." / "Done. Cancelled." by kind.
- no (no, nope, cancel, don't, stop, never mind): decline; "Okay, I won't."
- anything else (also "yes but make it five"): a normal message to `/v1/voice/ask`, which continues the conversation.

At most 3 follow-up turns per wake; each approval still queued allows one more, never beyond 5 (`FollowUp` in `FollowUpController.kt`, tested on the JVM). Outcome fields (additive): `spoken`, `expectsReply`, `pendingApprovalId`, `pendingKind`, `pendingQueue`, `pendingRemaining`, sent by `completeCommandWithReply` (an older dev build falls back to `completeCommand`). The command timeout is now 35 s (50 s for a clip) because Nerova runs the whole turn before the first byte. The in-app `/voice` route uses the same ask path: a plain answer is shown, an approval or a failure opens the companion sheet.

### Check-in replies

A booking can be checked in by voice from 30 minutes before it starts (`CHECK_IN_LEAD_MS`), since salon clients arrive early. When nobody can be checked in, the reply says what is next: "No one's due yet. Your next client, Thandi, is at 20:30." (first name, business-local HH:mm), or "No more clients today." `pickAppointmentToCheckIn` returns the next booking on a `none` result.

### Android constraints, and what we do about them

- **A microphone foreground service cannot start from the background** (Android 12+). Every start comes from the foreground app or from `VoiceTalkActivity`. If the system stops hands-free (reboot, force-stop), opening Settings > Clovie voice restarts it when it is switched on.
- **An app cannot start an activity from the background** (Android 10+). So the voice UI is an overlay window ("Display over other apps", `SYSTEM_ALERT_WINDOW`), and the app only opens on a tap on the overlay's button, which is a user gesture. Without the permission, results come as a heads-up notification (tap to open). We do not use full-screen intents.
- **The overlay is the only thing on screen** while talking. It ignores touches until a button is shown, so it does not block the app underneath.
- **Running a command with the app in the background** uses a headless JS task. It only has a signed-in session when the app's UI has run since launch (Clerk hands its token getter to the data layer then). On a cold start with no UI it answers `open_app`, and the owner taps **Open Clovie**; the `/voice` route finishes the check-in with the full app.

## Overlay page API

The native side drives the page with `evaluateJavascript`. The page is the approved design (VoiceWake, Clovie on the left, with the cinematic entrance and exit).

| Call | Meaning |
| --- | --- |
| `play('enter' \| 'exit')` | the entrance (called the moment the window is attached) and the exit (before it is removed) |
| `setState('listening' \| 'processing' \| 'done' \| 'request' \| 'error' \| 'idle')` | phase |
| `setTheme('dark' \| 'light')` | defaults to the system theme |
| `setLevel(0..1)` | mic level at ~30 Hz, smoothed from the recogniser's RMS (`LevelMeter`) |
| `setTranscript(text)` | what the owner said |
| `setMessage(text)` | the outcome ("Checked in Sipho") |
| `setAction(label \| null)` | shows a button; a tap calls `ClovieOverlayBridge.onAction()` |

The window is full width, 50% of the screen high, bottom-anchored (the glow fades out at its top). Edit `modules/clovie-voice/overlay/`, then run `node scripts/build-voice-overlay.mjs` in `apps/mobile` and commit the generated asset.

## Native module API (`apps/mobile/modules/clovie-voice`)

```ts
isSupported(): boolean                       // false on iOS, web and builds without the module
getStatus(): { status, error, wakePhrase }   // status: off | not_configured | starting | listening | standby | busy | error
start({ classifierPath?, threshold? }): Promise<state>   // hands-free on; call only while the app is on screen
stop(): state                                // hands-free off
startTalk(): Promise<state>                  // one-tap: listen for one command now (app on screen)
configureHandsFree({ useOpeningHours?, onlyWhileCharging?, timezone?, windows? })   // windows: [start, end, ...] epoch ms
getHandsFree(): { enabled, useOpeningHours, onlyWhileCharging, duty, untilMs, windowsUntilMs }
requestAddTile(): Promise<'added' | 'already' | 'dismissed' | 'unsupported' | 'error'>   // Android 13+
setLauncherIconEnabled(on) / isLauncherIconEnabled()   // the "Clovie Voice" icon for the side key
addStatusListener(cb): () => void            // "onStatusChange" events
canDrawOverlays(): boolean
requestOverlayPermission(): void             // opens Settings > Display over other apps
getTimings(): Record<string, number | null>  // wakeToOverlayMs, wakeToSttStartMs, sttMs, commandMs, totalMs
completeCommand(id, { status, message })     // used by the headless task
```

Errors: `permission_denied`, `background_start_blocked`, `model_load_failed`, `audio_failed`, `inference_failed`.

`not_configured` means the bundled models are missing from the build.

## Cloud transcription with the app in the background

With `EXPO_PUBLIC_VOICE_CLOUD_STT=1` the service records its own clip (`ClipCapture`, 16 kHz mono, ended by `ClipVad`) and a backend uploads it (`POST /v1/voice/transcriptions`, no `language`: the server auto-detects English or Afrikaans). A backgrounded or killed app has no Clerk session token, so the upload uses a **device voice token**:

- The app mints it while signed in and on screen (`POST /v1/voice/device-token`, `src/features/voice/deviceToken.ts`), keeps it in `expo-secure-store`, and hands a copy plus the API base URL to the service (`ClovieVoice.setVoiceToken`, stored in `VoiceTokenStore`: Android Keystore AES-GCM, else private SharedPreferences). It re-mints when missing or after a 401 (the service flags `rejected`, JS clears its copy), and revokes it on sign-out (`DELETE`).
- The **service uploads by itself** (`CloudTranscriber`) when it holds a token, so voice works with no JS runtime. The transcript (never the audio) then goes down the normal command path: headless JS, or "Open Clovie" when JS cannot finish. Without a token the JS clip path runs as before.
- The token works only on the clip upload and `POST /v1/attendance/:id/answer` (the notification actions use it when there is no Clerk session). Check-in and every other route still need the Clerk session, so "client has arrived" with the app killed ends in **Open Clovie** until check-in is added to the token scope.
- Every failure logs `cloud transcription failed status=401 code=UNAUTHENTICATED` (JS and native): status and our error code only.

`ClipVad` ends a clip after 1.2 s of continuous silence, never sooner than 1.5 s after speech started, with a 300 ms hangover so gaps between syllables count as speech. The speech threshold is the noise floor x 2.5 (minimum 0.006 RMS). No speech for 4 s ends it as "Didn't catch that"; the hard cap is 10 s.

## Timings

Every interaction logs these to logcat under the tag `ClovieVoice` (no transcripts, no names) and keeps the last values for `getTimings()`:

- `wakeToOverlayMs`: wake word detected to the overlay window being added (the page is preloaded).
- `wakeToSttStartMs`: detected (or the tap) to the recogniser listening. It starts at once; the chime and the entrance play while it comes up.
- `sttMs`: recogniser started to final result.
- `commandMs`: transcript handed to JS to the outcome shown.
- `totalMs`: detected to outcome.

The latency the owner feels (end of speech to first word) is in [Latency](#latency-end-of-speech-to-first-spoken-word).

```
adb logcat -s ClovieVoice
```

## Setup for Colin

Nothing to sign up for. Build a new dev client and say "Hey LiveKit":

1. `cd apps/mobile && npx expo prebuild --platform android` (or an EAS development build). The plugin adds the permissions, services and queries.
2. Install and open Settings > Customize > Clovie voice. **One-tap:** tap **Try it now** (accept the microphone and notification prompts, and allow "Display over other apps"), add the tile, and say "client has arrived". **Hands-free:** switch on Hey Clovie, choose the conditions, lock the phone or switch apps and say "Hey LiveKit, client has arrived".

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

## Measuring battery

The phone must be unplugged and left alone (screen off, no use) for about 35 minutes: a charging phone makes the numbers meaningless. In a shell with `adb` on the path:

```
adb shell dumpsys batterystats --reset
# 1. hands-free ON with the voice gate (Settings > Clovie voice > Hey Clovie, "always" so it listens now), screen off, idle ~15 min
adb shell dumpsys batterystats si.nerova.booking.dev      # note "Estimated power use (mAh)" and "Cpu: user ... system ..."
adb shell dumpsys batterystats --reset
# 2. hands-free OFF (one-tap only), screen off, idle ~15 min
adb shell dumpsys batterystats si.nerova.booking.dev
```

Compare the app's estimated mAh, CPU time and the held wake-lock time between the two runs. Switch hands-free back to the state you found it in afterwards. Measured numbers for the gated listener are not in this document yet.

## Latency: end of speech to first spoken word

Free, on-device changes only (no paid cloud STT or TTS). The owner feels the time from when she stops speaking to the first word she hears, so every step below is trimmed or hidden.

| Step | What we do | Expected saving |
| --- | --- | --- |
| End-of-speech detection | `SpeechCapture` prefers offline recognition on every attempt (`EXTRA_PREFER_OFFLINE`; the on-device recogniser, API 31+, is still tried first), turns on `EXTRA_PARTIAL_RESULTS`, and asks for 700 ms / 500 ms of silence (`COMPLETE_SILENCE` / `POSSIBLY_COMPLETE`; Google may ignore them). Where we control endpointing, `EndpointTracker` finalizes on the last stable partial after 400 ms of silence (microphone level from `onRmsChanged`, text unchanged for 400 ms), instead of the recogniser's own wait (about 1.5 s before, up to a second or more). | 0.5 to 1 s |
| Instant acknowledgement | The moment speech ends (recogniser callback, our endpointer, or the clip VAD) the soft "got it" cue plays and a light haptic tick fires (when touch feedback is on), and the UI goes to "processing". The cue used to wait for the transcript. | Perceived, 0.3 to 1 s |
| Live words | Partials stream through `setTranscript`, so the overlay and the in-app drawer show the words while she speaks (the drawer's listening view already renders `transcript`). On the cloud path words still arrive once, after the upload. | Perceived |
| Speaking sooner | `VoiceSpeaker` splits a reply into sentences (`SentenceSplitter`: no split in "3.5", "20:30" or after "Dr.", fragments under 6 characters join the next) and queues them (`QUEUE_FLUSH` for the first, `QUEUE_ADD` for the rest), so speech starts on sentence one. The TTS engine is warmed when listening starts (it already was; kept), and the reply's speech is requested 250 ms before the result cue ends, so the first word follows the cue instead of waiting out its full length (about 560 ms). The "One sec" filler still covers the companion's thinking time. | 0.2 to 0.6 s on long replies, 0.25 s on every reply |
| Warm network | While listening, the service pings `GET /v1/voice/ping` natively when it has a device token (as before), and now on both STT paths also starts the app's headless JS with `warm`, which pings the same route through the app's own HTTP client (the one that sends `/v1/voice/ask`) and prefetches today's bookings. Only while listening: nothing runs at rest. | 100 to 400 ms (DNS, TLS, Edge isolate, JS runtime start) |

**Does `/v1/voice/ask` stream? No.** `voiceAsk.ts` reads Nerova's `/v1/companion/chat` stream to its end and returns one JSON body, so the first sentence cannot be spoken before the whole turn is done. Speaking sooner therefore means splitting the finished reply. To speak the first sentence as soon as it exists, two changes are needed, neither done here: (1) `apps/api` returns the reply as NDJSON or SSE (`{ type: 'text', delta }`, then a final frame with approvals, actions and `awaitingReply`) as the Nerova stream arrives; (2) the app's `api.voiceAsk` reads that stream and hands each completed sentence to the service, which calls the speaker's `QUEUE_ADD` per sentence (the speaker already queues sentences). Nerova needs nothing for this if `/v1/companion/chat` already emits text deltas before the turn ends. It would only need changing if it buffers the text until `done`, in which case it must send `delta` events as the model writes.

### The `voice_latency` event

One event per turn, tracked by the app's UI runtime (`src/features/voice/latency.ts`, started from `registerVoiceHeadlessTask`), with the native service as the source. All values are whole milliseconds after the owner stopped speaking (`speech_end` is zero). A step that did not happen is absent. No transcript, reply or name is ever included, and `safeProperties` drops anything else.

| Property | Meaning |
| --- | --- |
| `final_transcript_ms` | final text available (on-device; absent for a cloud clip handled by the app) |
| `request_sent_ms` | `/v1/voice/ask` sent (the app's JS stamps wall-clock time) |
| `first_reply_byte_ms` | `/v1/voice/ask` answered (equals the whole reply until it streams) |
| `interim_start_ms` | the "One sec" filler began: usually the first word heard |
| `tts_start_ms` | the reply's first word began |
| `stt_path` | `device` or `cloud` |
| `endpoint` | `partial` (our endpointer), `recognizer` (its own end of speech) or `clip` (VAD) |

Read p50/p95 per property in PostHog. The same numbers go to logcat as `latency {...}`. If the app's UI is not running (a headless-only start) there is no analytics client, so the event is logged and not sent. `getTimings()` is unchanged. Tuning knobs: `EndpointTracker.SILENCE_MS` (400) and `VOICE_MARGIN_DB` (4), `SpeechCapture.SILENCE_MS` / `POSSIBLY_COMPLETE_MS`, `VoiceService.TTS_PREROLL_MS` (250). A shorter silence cuts people off who pause mid-sentence; raise it first if the owner is interrupted.
