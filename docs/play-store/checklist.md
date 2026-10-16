# Play Console checklist: from nothing to an internal testing release

For Colin. Ordered; each step lists what you need and how you know it is done. Google changes console labels and rules often, so where I rely on memory instead of the repo it says **(verify)**. Cost: the one-time Play developer registration fee (USD 25 at time of writing, **verify**).

Companion files: `listing.md`, `data-safety.md`, `declarations.md`, `privacy-policy.md` and `privacy-policy.html`.

## Phase 0: fix these in the repo first (they block everything)

- [ ] **Application id.** `apps/mobile/app.json` has `android.package = "si.nerova.booking.dev"`. Change to `app.getclovie` before the first upload. It is permanent once Play sees it. Also update the Nerova native app registration (`NEROVA_APP_ID`, `register-nerova-native-app.mjs`, which use `si.nerova.booking.dev`) and the Clerk Android settings that reference the package.
- [ ] **Account deletion** in the app plus `https://getclovie.app/delete-account` (see `declarations.md` section 9). Not needed to upload to internal testing, but needed before the form is complete and for production.
- [ ] **Privacy policy URL.** The app links to `https://nerova.si/privacy` (`apps/mobile/src/lib/legal.ts`). Host `privacy-policy.html` at `https://getclovie.app/privacy` and update that constant.
- [ ] **Voice demo check.** `docs/voice.md` says the Kotlin was never run on a device. Run it on a real phone before recording the foreground service video.
- [ ] **Remove unused permissions** (`READ/WRITE_EXTERNAL_STORAGE`), see `declarations.md` section 1.
- [ ] **Pilot test accounts:** one production Clerk test user (no MFA) for the Play reviewer.

## Phase 1: D-U-N-S number for Nerova AI Inc.

Google requires an **organization** account to have a D-U-N-S number, and the organization account is also what avoids the personal-account rule that new personal accounts must run a closed test with a minimum number of testers for 14 days before production **(verify the current numbers)**. For a pilot with one salon, an organization account is worth the wait.

1. Check whether Nerova AI Inc. already has one: https://www.dnb.com/duns-number/lookup.html (search by company name and US state). Stripe Atlas companies are often not listed yet.
2. If not listed, request a free D-U-N-S: D&B's free request page (https://www.dnb.com/duns-number/get-a-duns.html, **verify**; Google's help page links the right one for developers). Have ready: legal name exactly as on the incorporation papers, registered address, phone, the EIN, incorporation date, officer name. Use the same details everywhere.
3. **Timing:** D&B says up to **~30 days**; often faster.
4. **Faster route:** Google's own **D-U-N-S lookup and request tool** (in the Play Console registration flow, "Get a D-U-N-S number" link, **verify**) can speed it up and avoids you mailing D&B twice. Use it if the standard route stalls.
5. Make sure the legal name, address and phone in D&B **exactly match** the Play registration and your company documents; mismatches are the main cause of rejection.
6. Done when you have the 9-digit D-U-N-S and D&B shows Nerova AI Inc. as live.

While you wait, you can create the account under another route (see "If the D-U-N-S is late" below) or do Phases 2 to 4 offline.

## Phase 2: create the Play developer account

1. Sign in with a Google account used only for Nerova AI Inc. (a shared company mailbox, not a personal Gmail; e.g. `colin@nerovasystems.com` if it is a Google account, else a new one). Turn on 2-step verification.
2. Go to https://play.google.com/console/signup. Choose **Organization**.
3. Enter the legal name **Nerova AI Inc.**, the registered address, the D-U-N-S, a public developer name ("Nerova AI Inc."), **support email `support@nerovasystems.com`**, a public phone number is optional on the listing but required for verification, and the website `https://getclovie.app`.
4. Verify the developer **contact email** and **phone** (Google sends a code to each).
5. Pay the registration fee.
6. Complete **identity and organization verification**: Google asks for documents proving the company (certificate of incorporation, and often proof of address) and a government ID for the account holder (Colin), and possibly a verification video call or a payments profile check. Names and addresses must match D&B. Allow a few days, sometimes longer **(verify)**.
7. **Website verification.** In the developer profile, add `https://getclovie.app`. Google may ask you to prove you control it (**verify**; typically a DNS TXT record or a file via Search Console). Do it in the domain DNS for `getclovie.app`. Keep the TXT record permanently.
8. Install the Android **Play Console mobile app** and sign in; verification can require a physical Android device (**verify**).
9. Done when the Console home shows the account as verified and "Create app" is enabled.

### If the D-U-N-S is late

Don't register as an individual to "get started": a personal account has the closed-testing requirement for production and switching later is awkward (**verify** whether Google lets you convert). Wait for the D-U-N-S and meanwhile finish Phase 3, 5 and 6 materials. The internal test release can wait a few weeks; the pilot salon can test via EAS `preview` APKs sideloaded in the meantime (`eas.json` profile `preview` builds an APK).

## Phase 3: payments profile (only if asked)

Clovie has no in-app purchases. A merchant account is not needed for a free app; skip unless Google asks (**verify**). Subscriptions are arranged outside the app.

## Phase 4: create the app

1. Console > All apps > **Create app**.
2. App name `Clovie: Salon Bookings` (see `listing.md`), default language English (South Africa) (or English UK), **App**, **Free**.
3. Tick the declarations (developer program policies, US export laws).
4. Done when the app dashboard shows "Set up your app" tasks. Package name appears after the first upload and must be `app.getclovie`.

## Phase 5: set up the app content (can be done before the upload)

Go to **Policy and programs > App content** and complete each item. Reference file in brackets.

1. Privacy policy URL: `https://getclovie.app/privacy` [`privacy-policy.html`]. The URL must be live and public.
2. App access: login required, give the test account [`declarations.md` section 7].
3. Ads: No.
4. Content rating: IARC questionnaire [`declarations.md` section 5].
5. Target audience: 18+ [`declarations.md` section 6].
6. Data safety [`data-safety.md`].
7. Government apps: No. Financial features: none. Health: none. News: No.
8. **Foreground service permissions**: microphone, with the justification and the demo video link [`declarations.md` section 2]. Upload the video to YouTube as **unlisted** first.
9. Advertising ID: No.
10. Account deletion URL [`declarations.md` section 9] (in the Data safety flow).
11. Done when every item in the "App content" list shows a green tick.

## Phase 6: store listing

**Grow > Store presence > Main store listing** [`listing.md`]:

1. Short description, full description.
2. App icon 512x512, feature graphic 1024x500, 2 to 8 phone screenshots.
3. Category **Business**, contact details (email, website, phone), external marketing off.
4. Save. A listing is needed before production, but internal testing does not require the listing to be complete.

## Phase 7: build and Play App Signing

1. **Use Play App Signing** (the default and, for new apps, mandatory). Google holds the app signing key; you keep an **upload key**.
2. In the repo, build the `production` profile as an **AAB** (the `production` build in `apps/mobile/eas.json` has `autoIncrement: true` and no `buildType`, so Android defaults to an app bundle): from `apps/mobile`, `eas build --platform android --profile production`. The first run lets EAS **generate and keep the upload keystore** on Expo's servers. Download a backup copy (`eas credentials`) and store it in the company password manager. Losing the upload key is recoverable (Google can reset it) but slow.
3. Make sure the build targets the API level Play currently requires and that version codes increase (EAS remote versioning handles it, `appVersionSource: remote`).
4. Done when you have a signed `.aab` artifact.

## Phase 8: the first upload and internal testing release

1. Console > **Test and release > Testing > Internal testing** (or Release > Testing > Internal testing, **verify** the menu name).
2. **Testers** tab > **Create email list** (e.g. "Pilot salon"). Add each tester's **Google account email** (a Gmail or a Google Workspace address the person uses on their Android phone). Up to 100 testers. Include yourself, any colleagues, and the pilot salon owner and staff. Save, then tick the list for this track.
3. Feedback channel: set the feedback URL or email (`support@nerovasystems.com`).
4. **Releases** > **Create new release**. When asked about Play App Signing, accept enrolment. Upload the `.aab` (or submit from the CLI: `eas submit --platform android --profile production`, which needs a Google service-account JSON key; first upload usually has to be done by hand in the console for a brand-new app, **verify**).
5. Release name (auto), release notes (`listing.md` section 7), then **Save**, **Review release**, **Start rollout to Internal testing**.
6. Internal releases are usually available within minutes to a few hours and do not wait for the full production review **(verify)**. Fix any pre-launch errors it shows (permissions, target API, 64-bit).
7. **Opt-in link:** Testers tab > **Copy link** under "How testers join your test". Send this link to your testers. Each tester must (a) be signed in to the Google account on the list, (b) open the link **on their Android phone**, (c) tap **Accept invitation / Become a tester**, then (d) tap the Play Store link on that page to install Clovie. They update from Play like any app.
8. If a tester sees "item not found": wrong Google account, not on the list, or the release is still processing.
9. Done when the pilot salon owner can install Clovie from the Play Store and sign in.

## Phase 9: before production (later)

- [ ] Complete the store listing and all App content (green ticks everywhere).
- [ ] Account deletion in the app and the web page.
- [ ] Train and ship the "Hey Clovie" classifier, retest the microphone service on devices, re-record the demo video.
- [ ] Confirm the AI "report offensive output" mechanism for the companion **(verify policy)**.
- [ ] Closed or open testing track, then **Production > Create release**. A first production review can take days. Review is stricter for apps with microphone, overlay and AI features, so answer any reviewer message quickly and consistently with `declarations.md`.
- [ ] Staged rollout (for example 20%), watch Android vitals (Play Console), then widen.
- [ ] Keep the privacy policy, Data safety form and the in-app behaviour in agreement every release.

## Paste-ready summary of what to send the pilot salon

```
1. Make sure your phone is signed in to the Google account you gave us.
2. Open this link on your phone: <opt-in link>
3. Tap "Become a tester", then "Download it on Google Play".
4. Install Clovie and sign in with the email we invited.
5. If you get stuck, message us on WhatsApp or email support@nerovasystems.com.
```
