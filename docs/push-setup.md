# Push notification setup (Expo push + Firebase)

Why this exists: on Android, `getExpoPushTokenAsync` fails without (a) an Expo project id and (b) a
Firebase `google-services.json` compiled into the app. Until both are in place no phone registers a
token, so every push (approvals, attendance questions, new bookings) logs `devices: 0`.

How it flows: the app asks for a token from Expo, sends it to `POST /v1/devices` (upserted per
token), and the API sends through the Expo push service, which forwards to Google FCM. So Expo
needs your Firebase service-account key (step 5) as well as the app needing `google-services.json`.

`apps/mobile/app.config.ts` reads two inputs. Neither file is ever committed (`.gitignore` covers
`google-services*.json`).

| Input | Where it comes from |
| --- | --- |
| `EAS_PROJECT_ID` | `extra.eas.projectId` for the Expo push token |
| `GOOGLE_SERVICES_JSON` | `android.googleServicesFile`: path to that build's Firebase file. If unset, a git-ignored `apps/mobile/google-services.json` is used when present |

## Steps

1. **Expo account and project id.** Create an account at expo.dev, then in `apps/mobile` run
   `npx eas-cli login` and `npx eas-cli init`. Copy the project id it prints (a UUID).
   Add it as an EAS environment variable named `EAS_PROJECT_ID` (visibility: plain text) for the
   `development`, `preview` and `production` environments, and put it in `apps/mobile/.env.local`
   for local builds. (`eas init` may also try to write it into `app.json`; the env var is what we
   use, so revert that change if it appears.)

2. **Firebase project.** At console.firebase.google.com create a project named "Clovie".
   Add **two Android apps** with exactly these package names (the Gradle build fails if the
   file lacks the package being built):
   - `si.nerova.booking.dev` (development)
   - `app.getclovie` (production)
   - `app.getclovie.preview` too, if you build the preview variant with push.
   Skip the "add SDK" steps; Expo does that.

3. **Download `google-services.json`.** Project settings > General > Your apps > the Android app >
   download. Firebase can include all the apps in one file when they belong to one project: download
   it after adding every package above and it contains all of them.

4. **Give the build the file.**
   - EAS builds: upload the file as an EAS **file** environment variable named
     `GOOGLE_SERVICES_JSON` for each environment (`eas env:create --name GOOGLE_SERVICES_JSON
     --type file --value ./google-services.json --visibility secret --environment production`,
     repeat for `preview` and `development`). EAS exposes it as a path, which `app.config.ts` reads.
   - Local Gradle builds (`expo run:android`, `expo prebuild`): copy the file to
     `apps/mobile/google-services.json`. It is git-ignored and picked up automatically. After
     adding it, run `npx expo prebuild` (or the usual local build) again so it lands in
     `android/app/`.

5. **FCM V1 key for Expo's push service.** Firebase console > Project settings > Service accounts >
   Generate new private key (a JSON file). Then in `apps/mobile` run `npx eas-cli credentials`,
   choose Android, the build profile/package, then **Google Service Account Key for Push
   Notifications (FCM V1)** and upload that JSON. Do this for each Android package. In Google
   Cloud, the Firebase Cloud Messaging API (V1) must be enabled (it is by default on new projects).
   Keep this key out of the repo as well.

6. **Rebuild.** `google-services.json` and the project id are baked in at build time, so make a new
   dev build or EAS build. JS-only updates will not pick them up.

7. **Verify.** Sign in on the phone with the new build and accept the "Turn on" primer (or, if it was
   already allowed, nothing is shown). Then check the table has a row:
   `select user_id, platform, left(token, 20) from device_push_tokens;`.
   Send a test from expo.dev's push tool (Tools > Push notifications) to the token, or trigger an
   approval. The API log line `approval_push` should now say `devices: 1`.

## How the app registers

- After sign-in with an active business (`features/notifications`): if permission is already granted
  it registers silently; if it is undecided it shows a one-time primer ("Turn on" / "Not now") and
  then the system prompt; if denied it does nothing.
- It re-registers on every app start, when returning to the foreground and whenever Expo rotates
  the token. The API upserts per token, so repeats are harmless and a token moves with whoever signs in.
- Settings > Notifications reflects the real state (OS permission and your own choice). Switching it
  off unregisters the phone and is respected from then on.
- Signing out calls `DELETE /v1/devices` for this phone's token.
- A build without Firebase or the project id simply fails to get a token and tries again next start.

## iOS

iOS needs no Firebase; Expo pushes through APNs with credentials EAS manages. It only needs
`EAS_PROJECT_ID` and a paid Apple developer account.
