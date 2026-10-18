# Google Play declarations: Clovie (`app.getclovie`)

Answers for Play Console > App content and Policy > App content. Facts from `docs/voice.md`, `apps/mobile/plugins/with-clovie-voice.js`, the voice module's `AndroidManifest.xml` and the generated `android/app/src/main/AndroidManifest.xml`. Items not provable from the repo are marked **(assumption)**. Policy names and form layouts change; the structure below follows Play's current console, re-check labels when you get there.

Draft for Colin's review. This is not legal advice.

## 1. Permissions in the shipped build

From the generated manifest and the voice plugin/module:

| Permission | Why the app has it | Needs a Play declaration? |
| --- | --- | --- |
| `INTERNET` | talk to our API, Supabase, Clerk | No |
| `RECORD_AUDIO` | voice commands and the optional wake word | Sensitive, covered by the foreground-service declaration and the in-app prominent disclosure |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE` | the voice service while listening | **Yes**: Foreground service permissions form (section 2) |
| `POST_NOTIFICATIONS` | booking pushes, approvals, "Did X make it?", and the required listening notification | No form; runtime permission on Android 13+ |
| `SYSTEM_ALERT_WINDOW` ("Display over other apps") | the voice overlay shown over other apps | **No form exists**, but it is a reviewed permission; justify it in section 3 and in the review notes |
| `WAKE_LOCK` | keep the CPU awake while the microphone service listens on duty | No |
| `VIBRATE` | two light haptic ticks when Clovie wakes | No |
| `RECEIVE_BOOT_COMPLETED` (module manifest) | offer to restart hands-free listening after a reboot | No form; it only posts a notification because Android 15 blocks starting a microphone service from boot (`docs/voice.md`) |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (max SDK 32) | present in the manifest, apparently pulled in by an Expo library, not used by Clovie | **Remove if unused before release** (see note) |

Note: the two storage permissions are in `android/app/src/main/AndroidManifest.xml` with `maxSdkVersion=32`. If nothing in the app writes to shared storage, block them in the config (`android.blockedPermissions` in `app.json`) so Play does not ask you to explain them. I did not change code.

Not present, so nothing to declare: `ACCESS_*_LOCATION`, camera, contacts, calendar, SMS, call log, `QUERY_ALL_PACKAGES`, exact alarms (`setAndAllowWhileIdle` needs no permission), full-screen intent, `REQUEST_INSTALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, health permissions, advertising ID.

## 2. Foreground service permission: microphone

Console path: Policy and programs > App content > **Foreground service permissions**. Select `FOREGROUND_SERVICE_MICROPHONE`.

### Justification text (paste into the form)

```
Clovie is a business app for salon and barbershop owners. The microphone foreground
service (type "microphone", class VoiceService) lets an owner, whose hands are often
busy with a client, speak a short command to Clovie, for example "client has arrived",
or ask Clovie a question, and hear the answer read aloud.

The service runs in two situations only:
1. One tap. The owner taps the "Talk to Clovie" Quick Settings tile, the home-screen
   widget, the app-icon shortcut or the side key. A transparent activity is on screen
   when the service starts. Clovie records one short command (a few seconds), shows a
   small overlay and then stops. The microphone is open only while the owner speaks.
2. Optional hands-free "Hey Clovie". It is OFF by default. The owner switches it on in
   Settings > Clovie voice after a plain-language explanation, and chooses when it may
   run: only during the business's opening hours, only while charging, or both. The
   wake-word models run on the phone; audio is held in a short memory buffer and is not
   saved or sent unless the wake word is heard. Outside the chosen conditions the
   service closes the microphone completely.

Why a foreground service is required: the wake word must keep listening while the owner
is using another app or the screen is off, which a normal activity cannot do. For the
one-tap command, the audio capture must continue after the tap's transparent activity
finishes so the owner can stay in whatever app they were using.

User control and transparency: a persistent notification reads "Clovie is on duty:
listening for 'Hey Clovie'" with Pause (1 hour) and Stop buttons whenever the microphone
is open. Android's microphone indicator shows. The service never starts from the
background: every start comes from the foreground app or from the user's tap on the
tile, widget, shortcut or notification (Android 12+ rules).

Data: a command clip is used to turn speech into text and is not stored.
Hands-free audio is never uploaded unless the wake word is detected.
```

### Demo video storyboard (required; YouTube link, unlisted, 30 to 60 seconds, no narration required but captions help)

Record on a real Android 14 or 15 phone with a `preview` build, screen recording on, "show taps" on, and the status bar visible (the microphone indicator and notification must be visible in frame). Use a test business with fake clients. Language: English.

| # | Time | What the viewer sees | What it proves |
| --- | --- | --- | --- |
| 1 | 0:00 to 0:05 | Title card: "Clovie: microphone foreground service demo". Then the home screen. | Context |
| 2 | 0:05 to 0:15 | Open Clovie > Settings > Clovie voice. Show the explanation text. Show hands-free is **Off**. Tap "Try it now". The system microphone prompt appears. Tap "While using the app". | User-initiated, permission asked in context |
| 3 | 0:15 to 0:30 | Back to the home screen. Pull down Quick Settings, tap the "Talk to Clovie" tile. The overlay appears over the home screen, microphone indicator shows in the status bar. Say "client has arrived". Overlay shows "Checked in Sipho", the reply is read aloud, overlay leaves, the indicator disappears. | The service starts on a visible user tap and stops by itself |
| 4 | 0:30 to 0:45 | In Settings > Clovie voice switch "Hey Clovie" **on**. Show the choice: "Only during opening hours" and "Only while charging". Pull down the notification shade and show "Clovie is on duty: listening for 'Hey Clovie'" with Pause and Stop. | Opt-in, visible notification, user controls |
| 5 | 0:45 to 0:55 | Open another app (for example the clock). Say the wake phrase and a command. The overlay appears over the other app and answers. Tap **Stop** in the notification. Notification and microphone indicator go away. | Runs while another app is in use, and the user can stop it at once |
| 6 | 0:55 to 1:00 | Closing card: "Hands-free is optional and off by default." | Summary |

Notes:
- Until the "hey clovie" classifier is trained, the app uses the demo model and the phrase is "Hey LiveKit" (`docs/voice.md`). Either train "Hey Clovie" first or say so in the Play review notes, and make sure the Settings screen shows the phrase the build was configured for (it does). **Train the real model before production.**
- The Kotlin voice code had not been compiled or run on a device when `docs/voice.md` was written ("Not verified yet"). Do not record the video until the checks in that section pass on a phone.
- Show the **prominent disclosure** (the explanation and consent text on the Settings screen and in the permission dialog) in the video, because the Play User Data policy requires it before the runtime permission.

## 3. Overlay (`SYSTEM_ALERT_WINDOW`)

There is no console form. Put this in the **App access / review notes** and be ready to explain it if the reviewer asks.

```
Clovie shows a small voice panel over other apps ("Display over other apps"). It is the
only way the app can show the result of a spoken command when the owner is in another
app, because Android 10+ blocks background apps from opening their own screen. The panel
appears only after the owner taps Clovie's tile, widget or shortcut, or says the wake
word they switched on, and it ignores touches except on its own button. It shows what was
heard and the answer, then removes itself. The owner is sent to Settings > Display over
other apps from a screen that explains this; the permission is optional. Without it,
Clovie shows the result as a notification instead.
```

(From `docs/voice.md`: "Without the permission, results come as a heads-up notification". The overlay is not used for ads, to draw over system dialogs, or to capture input.)

## 4. Notifications

`POST_NOTIFICATIONS` is a runtime permission on Android 13+, requested in the app (`expo-notifications`). No console form.
Uses: new bookings and cancellations, "Clovie needs your OK" approval requests (with Approve and Decline buttons), "Did X make it?" attendance checks, and the listening notification of the foreground service. No marketing notifications are sent **(assumption: confirm there is no marketing push in `notifications.tsx` settings)**.

## 5. Content rating (IARC questionnaire)

Console path: App content > **Content rating**. Category: **All other app types** (it is not a game, social, news or entertainment app). Email: support@nerovasystems.com.

| IARC topic | Answer |
| --- | --- |
| Violence (cartoon, fantasy, realistic, sexual, blood, against humans or animals) | No |
| Sexuality or nudity | No |
| Language (profanity, crude humour) | No |
| Controlled substances (drugs, alcohol, tobacco; depiction, references, promotion) | No |
| Gambling or simulated gambling | No |
| Does the app offer in-app purchases or digital goods? | No |
| User interaction: can users interact with each other? | **No.** The app is a single-business tool; staff in one business see the same data but there is no public or user-to-user social feature |
| Does the app share the user's location with others? | No |
| Does the app let users share personal information (name, email, phone) with other users? | No. Staff within one business share client records, which is the business's own data, not public sharing |
| Does the app allow users to purchase digital or real-world goods? | No (no payments in the app) |
| Does the app contain user-generated content that other users can see? | No public UGC. Notes are visible only to staff of the same business |
| Does the app use unrestricted internet access or a web browser? | No general browser. A WebView shows the Nerova companion chat only **(assumption: the WebView is restricted to Nerova origins)** |
| Is the app about, or does it contain, news? | No |
| Does the app have AI-generated content? | **Yes, answer honestly if asked.** The Clovie companion generates text replies (Nerova AI). Play's AI-Generated Content policy asks AI apps to give users a way to report offensive output; check that the companion sheet has a "report a problem" link or add one before production **(assumption: not verified in the repo)** |

Expected result: **Everyone / PEGI 3 / IARC 3+** (the exact label Play shows may differ; accept what the questionnaire produces and do not request a higher one).

## 6. Target audience and content

| Question | Answer |
| --- | --- |
| Target age groups | **18 and over only** (tick "18 and over", nothing younger). Clovie is a business tool for owners and staff |
| Could the app appeal to children? | No |
| Is the app designed for children? | No. This keeps you outside the Families policy |
| App category and audience | Business, adults |
| Store listing | Does not use cartoon characters in a way that attracts children. Note: Clovie is a clover mascot, which is calm and non-juvenile; keep the feature graphic and screenshots adult and business-like |

## 7. Other declarations

| Declaration | Answer |
| --- | --- |
| **Ads** (does the app contain ads?) | **No** |
| **News app** | **No** |
| **Government app** | **No** (do not tick; Nerova AI Inc. is a private company) |
| **Financial features** | **None of the listed types.** No loans, no banking, no investments, no crypto, no payments in the app. Billing is a subscription arranged outside the app. Tick "My app doesn't provide any financial features" |
| **Health features / health apps** | **None.** No health data, no medical function, no Health Connect. Tick "My app doesn't have any health features" |
| **COVID-19 contact tracing and status** | No |
| **Data safety** | see `data-safety.md` |
| **Advertising ID** | **No**, the app does not use the advertising ID (no ad SDK present). Declare "No" so Play does not require the `AD_ID` permission handling |
| **App access** | Provide a **test account** (see below) |
| **Government/other restricted categories** | No |
| **Actions-in-app (Assistant)** | No |

### App access (login required)

Clovie requires sign-in with Clerk, so Play reviewers must be able to log in. In App content > App access choose "All or some functionality is restricted" and add instructions:

```
Sign in with the email and password below (test business "Clovie Demo Salon").
The account is an owner on a paid test plan with sample clients and appointments, so the
Calendar, Clients, Settings and the Clovie companion are all available.
Email: <test email>   Password: <test password>
Voice: Settings > Clovie voice > Try it now (accept the microphone prompt, optionally allow
Display over other apps), then tap the Quick Settings tile "Talk to Clovie" and say
"client has arrived". Hands-free listening is optional and off by default.
No second factor or code is needed for this account.
```

Make the test account in the **production** Clerk instance with sign-in by password allowed, and **turn off MFA/verification for it** or the reviewer will be blocked. Put the credentials in Play's field, never in the repo. **(Colin to create.)**

## 8. Other policy items to check before production

- **Prominent disclosure.** Before requesting `RECORD_AUDIO`, the app must show a clear in-app explanation of what is collected and why. `docs/voice.md` says the consent text exists on the Settings screen and in the permission dialog ("Privacy (POPIA)" section); verify it names the microphone, the cloud transcription step and where audio goes.
- **Target API level.** New apps and updates must target the API level Play requires at submission time (it moves each August; for late 2026 expect Android 16 / API 36 **(assumption: check the current Play requirement)**). Expo SDK 57 with RN 0.86 should default to a current target; confirm in the EAS build.
- **App bundle.** Play requires an `.aab`; `eas.json` `production` has no `buildType` set (the default for Android is `app-bundle`); `development` and `preview` build APKs. Upload only the `production` profile build.
- **64-bit.** The ONNX Runtime and any native `.so` must include `arm64-v8a` (default in Expo builds).
- **Play Integrity and signing.** Use Play App Signing; keep the upload key safe (see `checklist.md`).
- **Deceptive behaviour.** The listing must not claim features not in the build (for example, "Hey Clovie" works only after the classifier is trained; until then say "voice assistant").
- **Account deletion.** Create the web page and the in-app path (section 9).
- **Data safety form** must match the privacy policy word for word where they overlap.

## 9. Account deletion URL

**URL to submit:** `https://getclovie.app/delete-account`

Status: the in-app path exists (Settings > Delete account); publish the web page at the URL above if not yet live. Both are required for the form in Play Console > Policy > App content > Data safety > "Delete account URL". Create the page on getclovie.app with content like this (plain, no login needed):

```
Delete your Clovie account and data

Owners can delete the whole business account, and staff can delete their own login.

In the app: Settings > Delete account.

By email: write to support@nerovasystems.com from the email address you signed up with,
with the subject "Delete my Clovie account". Tell us the business name. We will confirm
your identity and delete the account within 30 days.

What is deleted
- Owner deleting the business account: the business, its services, staff, clients,
  appointments, WhatsApp conversations and messages, notification tokens and settings.
- Staff deleting their login: the sign-in and notification tokens. The staff entry
  remains on past appointments in the business's calendar, without the login link.

What we may keep
- Nothing that identifies you beyond what law requires; encrypted backups are
  overwritten within about 7 to 30 days (assumption, confirm).

If you are a customer of a salon that uses Clovie, ask the salon or write to us and
we will act on the salon's instruction. Your rights under POPIA and GDPR are in our
privacy policy: https://getclovie.app/privacy
```

Engineering follow-ups the page depends on (not done, read-only task):
1. Enable and expose Clerk's prebuilt user profile "Delete account" in the app Settings, or add `DELETE /v1/account` that deletes the Clerk organisation (the `organization.deleted` webhook then cascades through the database).
2. Delete the matching Nerova account and its companion conversations and any stored transcripts.
3. Send a confirmation email to the person who deleted.
4. Keep the web page's mailto flow as the fallback; Play requires the web path even if the in-app path exists.
