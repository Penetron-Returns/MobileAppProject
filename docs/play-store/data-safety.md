# Google Play Data safety form: Clovie (`app.getclovie`)

Answers for the Play Console form (App content > Data safety). Built from the real schema (`packages/database/supabase/migrations/*`), `docs/BUILD_PLAN.md`, `docs/voice.md`, `docs/nerova-connector.md` and `apps/mobile/package.json`. Items I could not prove from the repo are marked **(assumption)**; check them before submitting, because Play treats an inaccurate form as a policy violation.

Draft for legal review. This is not legal advice.

## 1. What the app stores about people (the inventory)

| Group | Where | What |
| --- | --- | --- |
| **Owners and staff (app users)** | `users` | Clerk user id, email, display name, avatar URL, role (owner/staff), business id |
| | `staff` | name, title, photo URL, phone, email, colour, active flag (a staff member may have no login) |
| | `device_push_tokens` | Expo push token, platform, user id |
| | `voice_device_tokens` | SHA-256 hash of a device voice token (the token itself is not stored), device label, last used, revoked |
| | `attendance_checks`, `attendance_pushes` | who was asked "Did X make it?", the answer, push log |
| | Clerk (not our DB) | sign-in identity: email, Google account id if Google sign-in is used, sessions, password hash if email+password is used |
| **The business** | `businesses` | name, slug, timezone, currency, logo URL, address, phone, email, booking rules, plan, Nerova account id (cached) |
| | `services`, `business_hours`, `business_special_days`, `availability_*`, `staff_*` | catalogue, prices (cents), hours, holidays, breaks, time off |
| | `whatsapp_accounts` | WhatsApp Business account id, phone number id, display phone, verified name, **encrypted** Meta access token, health fields |
| **The business's customers** (entered by the owner, or created when the customer books on WhatsApp or the web page) | `clients` | phone (E.164), name, email, notes, tags, blocked flag, WhatsApp opt-in, first/last seen |
| | `client_notes` | free-text notes written by staff |
| | `appointments`, `appointment_events` | what, when, with whom, price, status, notes, check-in, client confirmation, lifecycle events with actor |
| | `conversations`, `messages`, `escalations` | WhatsApp thread state and **message bodies** (inbound and outbound), delivery status, escalations to staff |
| | `booking_attempts` | research instrumentation: channel, step count and timestamps, session key, outcome (web comparator and WhatsApp) |
| **System** | `audit_log` | actor, action, entity, diff (config changes, team changes) |
| | `webhook_events`, `idempotency_keys` | raw inbound webhook payloads (can contain WhatsApp message content and phone numbers) kept for dedupe/replay, and request keys. Cleanup job prunes processed webhook events older than 30 days and expired idempotency keys (7-day default expiry) (`POST /cron/cleanup`) |
| **Voice** | on the phone | wake-word audio ring buffer in memory only; command clip; timings in logcat without transcripts |
| | server, in transit | the command clip (WAV, max 4 MiB) sent to `POST /v1/voice/transcriptions`, forwarded to Nerova speech-to-text (Azure, per the brief). Audio and transcript are never logged or stored by our API |
| **Companion** | server and Nerova | owner's chat text and spoken-command text sent to `/v1/voice/ask` or the embedded Nerova chat; replies and approvals returned. **Whether Nerova retains companion conversations is not documented in this repo (assumption: Nerova keeps them to run the companion; confirm with Nerova and then state the retention in the privacy policy).** |

The Android app SDKs in `apps/mobile/package.json` that matter for the form: `@clerk/expo` and `@clerk/clerk-expo` (sign-in), `@supabase/supabase-js` (reads and Realtime), `expo-notifications` (push), `expo-secure-store`, `@react-native-async-storage/async-storage`, `@nerova/react-native` (the companion SDK and chat), `react-native-webview` (companion chat, loaded from Nerova), `expo-device`, `expo-localization`, `@react-native-community/netinfo`, `onnxruntime-android` (on-device wake word, in the native voice module). **No crash reporter, analytics or advertising SDK is present** (searched for Sentry, Firebase, Crashlytics, PostHog, Analytics, AdMob in `package.json` and `android/app/build.gradle`: none; `@sentry/react-native` only appears in a Jest transform allow-list). `expo-updates` is not a dependency.

## 2. Top-level questions

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes.** All app traffic is HTTPS (Supabase, our API, Clerk, Nerova). Meta, Clerk and Supabase use TLS. Confirm no `http://` endpoint is configured in the production `EXPO_PUBLIC_*` env **(assumption)** |
| Do you provide a way for users to request that their data is deleted? | **Yes** (see section 5; the in-app path and the web page must exist before you submit) |

## 3. Data types: collected and shared

"Collected" means data leaves the device to us or a service provider acting for us. "Shared" means transferred to a third party **other than** a service provider processing it on our behalf. Per Play's definitions, our processors are **not** "sharing". Because Nerova AI Inc. is both the developer and the company behind the companion, a transfer to Nerova is not even a transfer to a different party **(assumption: confirm the legal entity running the Nerova companion is Nerova AI Inc.)**.

Fill in every row not listed as "No" and leave all other categories unticked.

### Personal info

| Type | Collected | Shared | Optional? | Purpose | In transit encrypted |
| --- | --- | --- | --- | --- | --- |
| **Name** (owner/staff display name; clients' names entered by owners) | Yes | No | Owner/staff name: required for an account. Client name: optional per client | App functionality, Account management | Yes |
| **Email address** (owner/staff sign-in and invitations; optional client email) | Yes | No | Sign-in email required. Client email optional | App functionality, Account management | Yes |
| **User IDs** (Clerk user id, business id) | Yes | No | Required | App functionality, Account management, Security/fraud prevention (audit log) | Yes |
| **Address** (business address, optional) | Yes | No | Optional | App functionality | Yes |
| **Phone number** (business phone, staff phone, clients' phone numbers, which is also their WhatsApp identity) | Yes | No | Business/staff phone optional. A client phone number is required to create a client | App functionality, Communications (reminders and confirmations) | Yes |
| Race, political, religion, sexual orientation, other info | **No** | | | | |

Note on sensitive content: owners write free-text client notes. We do not ask for health or sensitive data, but a note could contain it. Say so in the in-app help; the form does not need a Health category (see `declarations.md`).

### Financial info

**Not collected.** Prices are the business's own service prices and booking totals in cents, not user payment info. There are no in-app payments, no cards, no purchase history for the user. If Stripe is added later, revisit.

### Health and fitness: **No**. Location: **No** (no location permission or SDK). Contacts: **No** (no contacts permission). Calendar: **No** (the app does not read the phone's calendar; its own calendar is server data).

### Messages

| Type | Collected | Shared | Optional? | Purpose | In transit encrypted |
| --- | --- | --- | --- | --- | --- |
| **Other in-app messages** (WhatsApp conversations between a business and its customers shown in the Inbox and kept as `messages`; the owner's chat with the Clovie companion) | Yes | No | Optional (WhatsApp channel and companion are features the owner turns on) | App functionality, Communications | Yes |
| Emails, SMS or MMS | No | | | | |

### Photos and videos: **No** by default

We found no image-picker or camera dependency (`package.json`), and the logo and staff photo columns are URLs. If a logo or photo upload is added to the app later (the Supabase Storage buckets `logos` and `staff-photos` exist), add Photos here. **(assumption: no device photo upload ships in the first release.)**

### Audio files

| Type | Collected | Shared | Optional? | Purpose | In transit encrypted |
| --- | --- | --- | --- | --- | --- |
| **Voice or sound recordings** (the short command clip recorded after a tap or the wake word, sent to our API and then to speech-to-text) | **Yes, declare it** | No | **Optional**: voice is a feature the owner starts; hands-free is off by default | App functionality | Yes |
| Music files, other audio files | No | | | | |

Decision for Colin: Google's form lets you skip data that is only "processed ephemerally" (held in memory just long enough to answer, never stored). The clip is not stored or logged (`BUILD_PLAN` section 6, voice transcription row), so you could argue it is exempt. **Recommendation: declare it anyway.** The microphone is the most scrutinised permission, a reviewer will see `RECORD_AUDIO` and a microphone foreground service, and over-disclosure costs nothing. In the "Data usage" free-text help (Play lets you add a note in the policy, not the form) say "processed to transcribe your command, not stored".

Caveat for voice accuracy: the on-device path uses Android's `SpeechRecognizer`, which on some phones sends audio to Google's recogniser when the offline pack is not installed. That is the phone's own system service, not data we send, but it is why the privacy policy says "the phone's speech service". The cloud path (our server to Nerova/Azure) is behind `VOICE_CLOUD_STT` and `EXPO_PUBLIC_VOICE_CLOUD_STT` and is off by default in the repo. **Set the form to match the build you ship:** if you ship with cloud STT off, audio never reaches our servers and "Voice or sound recordings: collected" is arguably "No" (system recogniser only). Because your pilot brief says the clip goes through your server to Nerova, the answers here assume cloud STT is **on**.

### Files and docs, Calendar, Contacts: **No**.

### App activity

| Type | Collected | Shared | Optional? | Purpose | In transit encrypted |
| --- | --- | --- | --- | --- | --- |
| **App interactions** (PostHog product analytics: screens viewed and onboarding funnel steps in the owner app; no booking content, names, phone numbers or message text) | Yes | No (PostHog is a service provider acting for us) | Not user-switchable (a no-op when the key is unset) | Analytics | Yes |
| **User IDs** for analytics (Clerk user id and business id sent to PostHog as the identity, see `apps/mobile/src/features/analytics`) | Yes | No | Required | Analytics | Yes |
| **Other user-generated content** (bookings, client notes, service descriptions, appointment notes the owner writes) | Yes | No | Optional notes; bookings are the core function | App functionality | Yes |
| **Other actions** (audit trail of who changed settings, appointments, team) | Yes | No | Required | App functionality, Security/fraud prevention | Yes |
| In-app search history, installed apps | No | | | | |

### Web browsing: No.

### App info and performance

| Type | Collected | Notes |
| --- | --- | --- |
| Crash logs | **No** | No crash SDK. Play's own Android vitals are collected by Google, not by us, and need no declaration |
| Diagnostics | **No** | Voice timings go to logcat on the device only, with no transcripts or names. Our API logs request ids, route and status with PII redacted (security rule), kept by Supabase. **(assumption: that backend log content counts as service operation, not app diagnostics; the form is about what the app collects.)** |
| Other app performance data | No | |

### Device or other IDs

| Type | Collected | Shared | Optional? | Purpose | In transit encrypted |
| --- | --- | --- | --- | --- | --- |
| **Device or other IDs** (the Expo push token stored in `device_push_tokens`, used to deliver booking, approval and "Did X make it?" notifications) | Yes | No | Optional (notifications can be switched off; the token is only stored when push is enabled) | App functionality, Communications | Yes |

The `voice_device_tokens` credential is a per-app secret we generate, not a hardware identifier, and only its hash is stored; it falls under "User IDs".

## 4. Sharing, processors and "sharing" per Play's definition

We list every outside party that touches data so the privacy policy and this form agree. Per Play's help, "sharing" does not include: transfers to a **service provider** that processes data on our behalf, transfers for legal reasons, or transfers the user initiates with clear consent. All of the below are **service providers / processors**, so the form answer for every data type is **"Not shared"**.

| Party | Role | Data they handle | Why not "sharing" |
| --- | --- | --- | --- |
| Clerk | Authentication and organisations | sign-in email, name, Google account id, sessions, org membership | processes identity for us under contract |
| Supabase (EU, Ireland, per brief) | Database, API hosting, file storage | everything in section 1 | hosting provider acting for us |
| Nerova AI (same company as the developer; runs the companion and WhatsApp for paid plans) | Companion, speech-to-text, WhatsApp channel | companion chat text, bookings read via the connector, the voice clip, WhatsApp messages | same entity as the developer, or our processor |
| Microsoft Azure (via Nerova) | Speech-to-text | the voice clip, transiently | sub-processor of Nerova |
| Meta WhatsApp Cloud API | Delivers WhatsApp messages | customer phone numbers and message content | the channel the customer chose; delivery on behalf of the business |
| Expo push service, Google (FCM) | Delivers notifications to the phone | push token and the notification text | delivery provider |
| PostHog (US cloud, `us.i.posthog.com`) | Product analytics | Clerk user id, business id, screen and funnel events, no PII | analytics provider processing on our behalf |
| Apple push | iOS only (not in this Android release) | n/a | |

Judgment call for Colin: Meta is an independent party for WhatsApp, and customers use WhatsApp under Meta's own terms. We present it as the delivery channel (a service provider) because the owner's customer chooses to message the business there and we reply on the owner's behalf. If you want to be conservative, you can list "Phone number" and "Other in-app messages" as shared with Meta for "App functionality"; no policy risk comes from over-disclosing, but it would look odd next to the policy. Pick one and keep the privacy policy identical.

Data is **not** sold, not used for advertising, and not used to train models **(assumption on the last point: confirm with Nerova whether companion conversations are used to improve their models; if they are, this must be disclosed and the form must say so)**.

## 5. Data deletion

Required form fields:

- **Does your app let users request data deletion?** Yes.
- **Delete account URL (web):** `https://getclovie.app/delete-account`.
- **In-app path:** Settings > Delete account.

Current state of the product (verified):

- Account deletion **exists**: in the app at Settings > Delete account (`apps/mobile/src/app/delete-account.tsx`), and on the web at `https://getclovie.app/delete-account`.
- Deletion machinery already exists server-side through Clerk: `organization.deleted` deletes the business, and every business-owned table has `on delete cascade` from `businesses` (`BUILD_PLAN` section 3), so all customers, bookings, messages, staff and tokens go with it. `user.deleted` removes the user row and unlinks the staff row (`packages/features/team/services/clerkSync.ts`).
- Privacy policy URL: `https://getclovie.app/privacy`.

What is deleted and when, to state in the form and policy:

| Request | Result | Timing |
| --- | --- | --- |
| A staff member deletes their login | login and `users` row removed; staff row stays so past appointments keep their calendar entry, with the login link cleared | immediately on Clerk deletion |
| The owner deletes the business account | business and all its data deleted by cascade | immediately in our database; Supabase backups age out **(assumption: typical 7-day backup window; confirm the Supabase plan)**; completed within 30 days |
| A salon's customer asks for their own data to be deleted | handled by the salon (the responsible party) through the owner, or by emailing support, which acts on the owner's instruction | within 30 days |
| Data we must keep | none required by us; audit log rows for a deleted business go with it (`audit_log.business_id` is nullable; confirm rows are not orphaned with PII in `diff` **(assumption)**) | |

## 6. Security practices section

| Question | Answer |
| --- | --- |
| Data encrypted in transit | Yes |
| You can request that data be deleted | Yes |
| Committed to Play Families policy | No (the app is not for children) |
| Independent security review | No (do not claim one) |

Encryption at rest: Supabase encrypts disks by default **(assumption)**; Meta access tokens are additionally encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, `encryptSecret`); the device voice token is stored on the phone in Android Keystore AES-GCM or private SharedPreferences (`docs/voice.md`) and only its hash is stored on the server. The form has no at-rest question, but the privacy policy says it.

## 7. Short crib sheet to tick in the console

- Collected and not shared: Name, Email address, User IDs, Address, Phone number, Other in-app messages, Voice or sound recordings, Other user-generated content, Other actions, Device or other IDs, App interactions (PostHog).
- Not collected: everything else (location, contacts, photos, files, calendar, health, financial, web browsing, crash logs, diagnostics, search history (App interactions IS collected, via PostHog)).
- Optional: Address, Other in-app messages, Voice or sound recordings, Device or other IDs (and the notes inside Other user-generated content). Required: Name, Email, User IDs, Phone number (for clients), Other actions.
- Purposes: App functionality (all), Account management (Name, Email, User IDs), Communications (Phone number, Messages, Device IDs), Security and fraud prevention (User IDs, Other actions). Analytics (App interactions, User IDs). Not: Advertising or marketing, Personalisation, Developer communications.
- Encrypted in transit: Yes for every type.
- Deletion: Yes, with the web URL.

## 8. Assumptions to confirm before submitting

1. Supabase production region is EU (Ireland) (stated in your brief, not in the repo).
2. Cloud speech-to-text is on in the shipped build.
3. Nerova's retention and training use of companion conversations and voice transcripts.
4. Nerova-side deletion process.
5. Backup retention on the Supabase plan.
6. No photo upload ships in the first release.
7. Production API and Nerova endpoints are all `https`.
