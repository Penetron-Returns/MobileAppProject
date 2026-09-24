---
name: whatsapp-cloud-api-fieldguide
description: Build, configure and debug bots on Meta's WhatsApp Cloud API. Use for any Cloud API task — access tokens, webhooks that verify but never deliver, WhatsApp Flows, message templates, rate limits, pricing, test numbers, Coexistence, App Review — and especially when the panel says "connected successfully" but no messages arrive, an approved permission behaves as if it were missing, or an API call fails with an opaque error code.
license: MIT
compatibility: Requires network access to graph.facebook.com. The bundled diagnostic script needs Python 3.9+ and httpx. Verified against Graph API v26.0 on 2026-09-03.
metadata:
  version: "1.1.1"
  last-verified: "2026-09-03"
  graph-api-version: "v26.0"
  source: "https://github.com/guisa17/whatsapp-cloud-api-skill"
---

# WhatsApp Cloud API

Field notes from shipping production bots on Meta's Cloud API.

**The one thing to internalize: in this API, the default failure mode is
silence.** The three most common misconfigurations produce no error, no
warning, and no failed request — the panel says "connected successfully" and
messages simply never arrive. If something isn't working and there's nothing in
your logs, start at [§3](#3-the-three-invisible-steps).

## How to read this

Claims are tagged so you know what to trust:

- **[verified]** — confirmed against Meta's docs or a live API call on the date below.
- **[field]** — observed in production. True at least once, for at least one setup.
- **[unconfirmed]** — reported by third parties, *not* found in Meta's docs. Verify before acting.

**Last verified: 2026-09-03 against Graph API v26.0.** Anything about *where a
button lives in the panel* ages fastest — Meta redesigns often. Treat §1 as a
hint, not a map.

Everything below was re-verified on that date:

| Claim | Re-verified | Note |
|---|---|---|
| Graph API is on **v26.0** | 2026-09-03 | Unchanged; released 2026-07-29 |
| Pricing is **per message** since 2025-07-01 | 2026-09-03 | Unchanged |
| The 2026-10-01 free-window change | 2026-09-03 | **Confirmed in Meta's docs** — service messages and in-window utility templates become billable. See [§7](#7-pricing-model) |
| Flow JSON freeze/expiry + ~90-day notice | 2026-09-03 | Unchanged |
| **Latest Flow JSON is 7.3** | 2026-09-03 | Confirmed *Recommended* in Meta's changelog. The page 500s to scripts but renders in a browser — see [§5](#5-flows) |

---

## 1. Panel navigation

**[field, 2026-08]** `developers.facebook.com` is organized by **use cases**.
There is no "WhatsApp" item in the app sidebar; looking for one wastes time.

| What you need | Where it lives |
|---|---|
| Temp token, Phone Number ID, WABA ID, test number | App Dashboard → *"Customize the 'Connect with customers on WhatsApp' use case"* → **Step 1: Try it** |
| Webhook URL and verify token | **Step 2: Production setup** → Configure webhooks |
| Permissions and access level | **Other tools → Permissions and features** |
| Permanent token | Different site: `business.facebook.com` → Business settings → **Users → System users** |

**Identify screens by content, not menu labels.** "Step 1: Try it" is the one
showing the test number, Phone Number ID, WABA ID, and a "To" selector for
sending a test message. That description will survive redesigns; the label
won't.

⚠️ **[field]** Portfolios often contain **several apps with the same name**.
The name is not enough to know which one you're holding. Compare **IDs**, and
make your tooling print the ID of the app that owns the token.

### The documentation moved

**[verified, 2026-09]** Meta reorganized the developer docs. WhatsApp pages now
live under:

```
https://developers.facebook.com/documentation/business-messaging/whatsapp/...
```

The old `/docs/whatsapp/...` paths **404 rather than redirect** — for example
`…/docs/whatsapp/embedded-signup/onboard-whatsapp-business-app-users` is gone,
and the page is now at
`…/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/`.
Some old paths still serve a **stale copy** instead of 404ing, which is worse:
you read outdated content believing it's current. If a link in a blog post (or
in an older version of this file) points at `/docs/whatsapp/`, re-find the page
under the new prefix before trusting it.

---

## 2. Tokens

### Temporary (24 hours)

Found in *Step 1: Try it*. Fine for getting started, **expires the next day**:

```
Error validating access token: Session has expired on ...  (code 190)
```

**[field]** When it expires, your bot still *receives* messages but fails to
send. If your code queues failed sends for human review, you'll see
conversations piling up while customers get nothing.

### Permanent (system user)

`business.facebook.com` → Business settings → Users → **System users** → Add →
Generate token.

- System user role: **Employee** is enough. Admin is not required.
- Assets: the **app** and the **WhatsApp account**, both with full control.
- Permissions: `whatsapp_business_messaging` and `whatsapp_business_management`.
- Expiration: **Never**.

⚠️ **[field]** **Requires approval from another business admin.** Meta enforces
two-person control for non-expiring tokens; the request expires after 7 days.
The temporary token keeps you unblocked meanwhile.

⚠️ **[field]** There are **two "WhatsApp Accounts" entries** in the asset
picker: the first lists **WABAs** (by name), the second lists **phone numbers**.
You must assign in both.

### Identify which token you hold

```bash
curl -s "https://graph.facebook.com/v26.0/debug_token?input_token=$TOKEN&access_token=$TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; \
print(d['type'], '| expires:', d.get('expires_at') or 'NEVER', '|', d.get('scopes'))"
```

`SYSTEM_USER` + `expires: NEVER` is the one you want.

### Token types are not interchangeable

**[verified]** Some endpoints require an **app access token**
(`{app_id}|{app_secret}`), not a user or system-user token. Calling
`GET /{app-id}/subscriptions` with the wrong one returns:

```
(#190) Application Secret required for this endpoint
```

This matters for diagnostics: a tool that treats "couldn't check" as "not
configured" reports a problem that doesn't exist and sends you hunting for
nothing. **Distinguish the two states explicitly.**

---

## 3. The three invisible steps

None produce an error. All three produce the same symptom: **silence**.

### a) The WABA must subscribe to the app

Configuring the webhook in the panel is **not enough**:

```
POST /{waba-id}/subscribed_apps
```

**[field]** Without it, webhook verification passes, the panel says "connected
successfully", and not one message arrives. **There is no button for this in
the UI.**

```bash
curl -X POST "https://graph.facebook.com/v26.0/$WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"
# Verify with GET on the same endpoint.
```

⚠️ With a test WABA shared across apps in one portfolio, seeing "apps are
subscribed" **does not mean yours is**. Cross-check against `GET /app`.

### b) Webhook fields are subscribed separately

Different from the above. An app can be subscribed to the WABA and still have
no `messages` field:

```
POST /{app-id}/subscriptions
     ?object=whatsapp_business_account
     &callback_url=...&verify_token=...&fields=messages
```

Requires an **app access token** (see §2).

**[field]** Changing the webhook URL can reset this. Re-check after any change.

### c) The recipient must be allowlisted

**[field]** A test number only replies to registered numbers:

```
(#131030) Recipient phone number not in allowed list
```

The inbound message **does** arrive; the outbound reply fails. Add numbers in
*Step 1: Try it* → **To** selector. Up to 5.

---

## 4. Webhooks

### Verification (GET)

Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`. Return **the
challenge verbatim as plain text** when the token matches; `403` otherwise.

### Receiving (POST)

Validate `X-Hub-Signature-256` — HMAC-SHA256 of the **raw body** with your App
Secret. Two traps:

- Sign the **exact bytes received**. If your framework re-serializes the JSON
  before you see it, the signature will never match — key order and whitespace
  differ.
- Compare in **constant time** (`hmac.compare_digest`).

### Respond 200 immediately

Meta retries on slow responses. Queue the work and return right away.
Processing inside the handler causes retries and duplicate messages.

**Deduplicate by `wa_message_id`.** The same webhook can legitimately arrive
more than once.

### A payload without messages is not an error

Status events (delivered, read) arrive on the same webhook with
`field: "statuses"`. Your code must ignore them without breaking.

---

## 5. Flows

### Publish by API, don't draw in the Builder

Keep the JSON **versioned in your repo** and publish it:

```
POST /{waba-id}/flows      → create (name, categories)
POST /{flow-id}/assets     → upload JSON (multipart, asset_type=FLOW_JSON)
POST /{flow-id}/publish    → publish
```

A form drawn by hand in the panel **drifts from your code with nothing warning
you**: the response keys are a contract with your backend, and nobody is
diffing them. With the JSON next to the code that reads it, changing a field
is a reviewable diff.

`POST /{flow-id}/assets` returns `validation_errors` with line and reason —
the only way to learn why a Flow won't publish.

### Versioning is an operational concern

**[verified]** Flow JSON follows semver. Versions pass through two states:

| State | What happens |
|---|---|
| **Frozen** | Can't publish *new* Flows on it. Existing ones keep working. |
| **Expired** | **Existing Flows can no longer be opened.** |

**[verified, 2026-09]** Meta's stated policy: *"In general, the period before
freeze or expiry will be 90 days from the release of a new version"* — while
noting that "circumstances may require that a version be frozen or expired in
less than 90 days." Third-party guides quoting a **12-month** support window
are stating something Meta's versioning page does not.

⚠️ **Combine that with the next bullet and you get a real lifecycle problem:**
a published Flow is immutable, and its version will eventually expire. Plan to
**recreate Flows periodically**, and keep the JSON in source control so that
recreation is cheap.

**[verified, 2026-09-03]** Latest Flow JSON: **7.3**, and it is the one Meta
marks *Recommended*. The changelog's own "Updated" stamp reads **2025-11-07**,
so 7.3 has been current for roughly ten months — this claim is stable, not
merely unchecked.

⚠️ **The changelog renders in a browser but returns HTTP 500 to every
programmatic client** — old and new prefixes, with or without the anchor, curl
with browser headers, archive mirrors. If you're scripting a freshness check,
it will look permanently down. **Open it in a browser instead.**

### Supported versions are two different lists

The table splits by *what you're doing*, and this is what "frozen" means in
practice:

| | Flow JSON versions |
|---|---|
| **Publishing** a Flow | 5.1 · 6.0–6.3 · 7.0–7.2 · **7.3 (recommended)** |
| **Sending** an existing Flow | 2.1 · 3.0 · 3.1 · 4.0 · 5.0 · 5.1 · 6.0–6.3 · 7.0–7.2 · **7.3 (recommended)** |

The five versions in the second list but not the first — **2.1, 3.0, 3.1, 4.0
and 5.0** — are the frozen ones: still sendable, no longer publishable. (5.0 is
frozen while 5.1 is not, which matches its 2025-09-09 freeze.)

**[verified, 2026-09-03]** As of that date **nothing has expired yet**:
everything back to 2.1 can still be sent. The expiry stage is real and worth
planning for, but no Flow has actually stopped opening because of it.

### The other two version numbers

Flow JSON is not the only version in play, and the skill's earlier focus on it
alone was too narrow:

| Field | Current | Notes |
|---|---|---|
| `data_api_version` | **4.0** (recommended; 3.0 still supported) | Adds two-signature auth for Flow endpoints |
| Message version | **3** (recommended) | The `flow_message_version` in the send payload |

**[verified]** Data API **4.0** (Nov 2025) strengthened endpoint security with
two signatures: *platform-side signature verification*, handled by Meta with no
work on your side, and an optional *flow token signature* added to the data
channel payload, which you can verify to confirm a request really came from the
user who received the Flow message. Opt in by setting `data_api_version` to
`4.0` in the Flow JSON.

### Gotchas

- **[verified]** A published Flow is **immutable**. Meta rejects new assets on
  it. To change one, create another.
- **[field]** **Sending an empty `data: {}` breaks the send.** The error talks
  about the *type* when the real problem is that the field **shouldn't be
  there**:
  ```
  (#131009) Parameter data in flow_action_payload for CTA flow
            must be of type dynamic_object
  ```
  Omit `data` unless you actually have initial data.
- **[field]** `mode` must match the Flow's state. A published Flow opens with
  `mode: "published"`; a draft only in draft mode. Mismatching gives an opaque
  error.
- **[field]** `input-type: "number"` can come back **unquoted**. A bare
  `isinstance(str)` check drops the value **silently**. Accept numbers and coerce.
- **[field]** `flow_token` returns unchanged in the webhook — use it to tie the
  response to the conversation that opened it. **One per conversation**, never
  a fixed value.
- **[field]** `response_json` inside `nfm_reply` is a **string containing
  JSON**, not an object. Parse it separately.

---

## 6. Limits that bite

**[verified]**

| Limit | What happens if you exceed it |
|---|---|
| **3 buttons** per interactive message | Meta rejects the **entire** message |
| **20 characters** per button title | Same |
| **10 rows** per list | Total across sections, not per section |
| **24 characters** per row title | |
| **1024 characters** of body | |
| **`media_id` expires after 30 days** | The file stops sending. Re-upload |
| **24-hour window** | Outside it you can only send **approved templates**. Inside it, replies are free **only until 2026-10-01** — see [§7](#7-pricing-model) |

**Validate limits before calling the API.** An over-limit payload returns a
generic 400 that doesn't say which field was wrong; an explicit error in your
own code saves the guessing.

On the 20-character limit: if you're tempted to put a person's name in a
button, **don't**. Put the name in the message body — which has no such limit —
and keep the button text fixed. Truncating *"Message Alexandra"* to
*"Message Alexan"* looks like a bug to the customer, and it happens with names
longer than about seven letters.

---

## 7. Pricing model

**[verified, 2026-09]** Pricing is **per message**, since 2025-07-01. This
replaced the older per-conversation model — if you find a guide describing
24-hour "conversations" as the billing unit, it's out of date.

- You're charged when a **template message is delivered**.
- Categories: **Marketing** (always charged), **Utility** and **Authentication**
  (charged outside customer service windows).
- **Non-template messages inside an open customer service window are free** — **until 2026-10-01**, see below.
- A 72-hour **free entry point** window applies when the user initiates contact
  through ads or Page buttons.

### The free window is ending — 2026-10-01

**[verified, 2026-09-03]** This is documented, but **not on the pricing page**.
It lives on a separate page that the main pricing page does not surface:
`…/whatsapp/pricing/non-template-messages`. Two dates:

| Date | What changes |
|---|---|
| **2026-08-01** | Meta charges for **Meta Business Agent** messages, **per token**, invoiced monthly. |
| **2026-10-01** | Meta charges for **service messages** — *"which have not been charged since November 2024"*. |
| **2026-10-01** | Meta charges for **utility templates sent in response to users inside an open 24-hour customer service window** — *"these messages have not been charged since July 1, 2025"*. |

Definitions and rates:

- *"Any non-template message that is not powered by Meta Business Agent is a
  service message."* So a free-form reply — from a human agent or your own
  third-party bot — is a service message, and becomes billable.
- **Service messages are priced like utility and authentication messages** for
  the same country.
- Meta said it would publish the 2026-10-01 rates **by 2026-09-01**.
- The **72-hour free entry point** window is unchanged for template delivery.

⚠️ **Read §7 above with this in mind.** Everything in it describes the model
*until 2026-10-01*. After that date, "non-template messages inside an open
window are free" and "utility templates in-window are free" both stop being
true, and the practical consequence is large: **a bot that only ever replies
inside the 24-hour window goes from free to paid per message.**

> **Why this was easy to get wrong.** Meta splits *current* pricing and
> *upcoming* pricing across different pages. As of 2026-09-03 the main pricing
> page still states — correctly, for today — that non-template messages and
> in-window utility templates are free, with `"billable": false` and
> `"type": "free_customer_service"` in the pricing object. Nothing on it says
> that changes in four weeks. **Read the "upcoming pricing updates" page before
> concluding anything about future cost**, and don't treat the absence of a
> change on the main page as evidence there isn't one. An earlier version of
> this file drew exactly that wrong conclusion and labelled the change
> `[unconfirmed]`.

**[verified]** The **On-Premises API was fully sunset on 2025-10-23.** Cloud
API is the only supported official architecture.

---

## 8. Coexistence and App Review

**Coexistence** lets one number work in the WhatsApp Business app *and* the
Cloud API at once, with `smb_message_echoes` webhooks delivering what a human
replied from the app.

**Decision rule:** *does any human send messages from THAT number?* → you need
Coexistence. If the bot is the only thing living there, you don't.

**[verified, 2026-09]** In Meta's docs this lives under **Embedded Signup →
onboard WhatsApp Business app users**, which is a **Tech Provider** flow.
Becoming a Tech Provider requires **Advanced access to both
`whatsapp_business_messaging` and `whatsapp_business_management`** — the first
to send on behalf of clients, the second to reach their WABAs. Without it,
calls against WABAs your business doesn't own fail with error 200.

**[field]** In practice that made the path:

```
Tech Provider  →  App Review  →  Advanced Access  →  App published (Live)  →  Coexistence
```

The Tech Provider prerequisite is the step people miss, because the panels let
you connect the number, report success, and then deliver nothing.

### Advanced Access is inert while the app is in Development mode

This is the trap that costs the most time, because it makes an *approved*
permission behave exactly like a missing one.

**[verified, 2026-09]** *"Apps in Development mode can only request permissions
from role users."* Development mode limits the app to people who hold a role on
it (admins, developers, testers) **no matter what App Review approved**. Live
mode is what makes Advanced Access mean anything for everyone else.

**[field, 2026-08-31]** Concretely: with all three permissions already showing
**Approved / Advanced Access**, the Embedded Signup dialog still failed with

```
missing required Graph API permissions for Cloud API companion pairing
```

The permissions were **not** missing. The app was still unpublished. Flipping
it to Live — with no change to permissions — made the same flow succeed on the
next attempt. **Read that error as "permissions not in effect", not
"permissions not granted"**, and check app mode before re-submitting anything
to review.

### Embedded Signup creates its own WABA

**[field, 2026-08-31]** The flow **created a brand-new WhatsApp Business
Account** for the number rather than using the empty WABA that had been
pre-created and passed to it for exactly this purpose. Meta's docs don't
promise either behavior — they describe connecting "their existing WhatsApp
Business app account", which reads as though an existing WABA would be reused.
It wasn't.

Consequences, all of which showed up in the same session:

- **Two WABAs ended up with near-identical names** — the empty one created by
  hand and the one Embedded Signup made. In the pickers they are
  indistinguishable by name.
- **One of them was invisible to the app.** Selecting the wrong one produced
  only:
  ```
  no es un identificador de negocio válido
  (not a valid business identifier)
  ```
  with nothing indicating *which* WABA was expected or why the other one didn't
  qualify.
- Every post-connection step — `subscribed_apps`, assigning the system user,
  the `WABA_ID` in your config — has to point at the WABA the flow **actually
  created**, not the one you planned to use.

**So:** don't pre-create a WABA for a Coexistence number and assume it will be
used. After the flow completes, **read the WABA ID back from the API** and
treat that as the source of truth:

```bash
# WABAs owned by the business — find the one that actually holds the number
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://graph.facebook.com/v26.0/{business-id}/owned_whatsapp_business_accounts"

# Confirm the number landed, and on Cloud API
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://graph.facebook.com/v26.0/{waba-id}/phone_numbers?fields=display_phone_number,platform_type,status,is_on_biz_app"
```

`platform_type` must read **`CLOUD_API`**. **[field]** `ON_PREMISE` here is the
value that fools people: the panel says connected, the number is listed, and
nothing works.

### After the connection: four steps, one symptom

**[field]** The flow finishing is not the end. Four things have to be redone
against the **new** WABA and the **new** number, and **skipping any of them
produces the same silence** — no error, no failed request, no log line.

1. **Assign your system user to the new WABA — and to the new number.** They
   are **two separate entries** in the asset picker (§2): one lists WABAs, the
   other lists phone numbers. Assigning only the WABA is the common miss.
   Whatever your token could reach before, it cannot reach these — they didn't
   exist an hour ago.
2. **`POST /{waba-id}/subscribed_apps`** on the new WABA. The subscription you
   made during development was for a *different* WABA and does not carry over.
   There is still no button for this (§3a).
3. **Update the IDs in your own config** — `WABA_ID`, `PHONE_NUMBER_ID`. If
   they still point at the test number, your bot starts cleanly, logs nothing
   unusual, and processes none of the real traffic. Restart whatever caches
   them at boot.
4. **Send a real message from an allowlisted number** and confirm it lands in
   your system. The panel is not evidence; a row in your database is.

The token itself usually does **not** need replacing — a system-user token
doesn't expire. It just needs the assets from step 1.

### Other things learned the hard way

- **The 14-day rule** — **[verified, 2026-09]** now documented, as an
  offboarding reason: `PRIMARY_INACTIVITY (primary device inactive for
  approximately 14 days)`. If nobody opens the WhatsApp Business app for ~14
  consecutive days, Meta stops syncing and can offboard the number. Tell the
  team that owns the phone; it reads as an outage later.
- **[verified, 2026-09]** The phone must run **WhatsApp Business app 2.24.17 or
  higher**.
- Coexistence **cannot be tested with a test number**. There is no dry run —
  the first real execution is on a number people depend on.
- **[field]** The flow must be completed **in one sitting**, with the phone in
  hand. Interrupting it leaves the number half-registered and you have to clean
  up before retrying.
- **[field]** App Review timing, one data point: submitted **2026-08-15**,
  approved **2026-08-27** — 12 days, approved first try, against the **20 days**
  Meta's own panel advertises. The *"~5 business days"* that circulates in
  third-party guides is **wrong** for App Review; it belongs to a different
  process. What made it go through in one pass was submitting complete:
  per-permission justification, screencast, data-handling declaration,
  published legal documents, and a scoped test account for the reviewer.
- **[field]** **Meta's automated support gave wrong answers repeatedly** during
  one diagnosis — claiming a missing payment method, claiming misconfiguration,
  and denying features that exist. Verify against the API.

**"Ready for testing"** in Permissions and features = **Standard Access**:
enough for the test number and for admins/developers of the app. A real number
needs **Advanced Access** via App Review.

Don't request permissions you don't use — it complicates review, and the
reviewer will ask what you need them for. A bot that replies to messages needs
`whatsapp_business_messaging` and `whatsapp_business_management`.

---

## 9. Symptom → cause

| Symptom | Most likely cause |
|---|---|
| Panel says "connected", nothing arrives | Missing `subscribed_apps`, or missing the `messages` field |
| `Session has expired` (code 190) | Temporary token expired |
| `(#190) Application Secret required` | Wrong token type — that endpoint needs an app token |
| `(#131030) Recipient not in allowed list` | Number not allowlisted on the test number |
| `(#131009) must be of type dynamic_object` | Sending an empty `data: {}` in a Flow |
| `(#131047)` / "Re-engagement message" | 24-hour window closed — you need a template |
| Meta won't validate the callback URL | The URL returns 404 or 5xx — check your proxy before the token |
| Signature never matches | You're signing re-serialized JSON, not the raw body |
| Duplicate messages | Not deduplicating by `wa_message_id`, or responding 200 too slowly |
| Flow opens, nothing happens | Flow is a draft, or `mode` doesn't match |
| Flow suddenly stops opening | Its Flow JSON version expired |
| `missing required Graph API permissions for Cloud API companion pairing` | Often **not** missing permissions — the app is still in Development mode, where Advanced Access is inert ([§8](#8-coexistence-and-app-review)) |
| "not a valid business identifier" during Embedded Signup | Wrong WABA picked — Embedded Signup made its own, and it's the near-identical twin ([§8](#8-coexistence-and-app-review)) |
| Coexistence number connected, `platform_type: ON_PREMISE` | The pairing didn't complete on Cloud API. It is not connected, whatever the panel says |
| Coexistence finished, still total silence | One of the four post-connection steps was skipped — system user, `subscribed_apps`, config IDs, all against the **new** WABA ([§8](#8-coexistence-and-app-review)) |
| Coexistence number stopped syncing | Nobody opened WhatsApp Business for ~14 days (`PRIMARY_INACTIVITY`) |
| A doc link 404s, or contradicts the panel | Docs moved to `/documentation/business-messaging/whatsapp/`; old paths 404 or serve a stale copy ([§1](#1-panel-navigation)) |

### Verify without trusting the panel

```bash
# Does the URL actually respond?
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR-DOMAIN/your/webhook
# A 4xx from your framework = it exists. 404 = it never reaches your app.

# The full handshake, exactly as Meta does it
curl -s -G "https://YOUR-DOMAIN/your/webhook" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=$VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=test123"
# Must return exactly: test123
```

⚠️ **A 200 proves nothing.** If your domain serves a SPA with
`try_files … /index.html`, **every unknown path returns 200** with the SPA's
HTML. Compare **content**, not status:

```bash
curl -s https://YOUR-DOMAIN/your/path | grep -oE '<title>[^<]*</title>'
```

This has already caused a broken deployment to be declared working.

---

## 10. Starting a new project

Order that avoids rework:

1. **App + test number.** Don't touch a real number until the flow works —
   changing the webhook on a number in use interrupts service.
2. **Webhook**: public HTTPS URL + verify token. Use a tunnel with a *static*
   domain while developing, so you don't re-point Meta on every restart.
3. **`subscribed_apps` + fields.** Both. See §3.
4. **Allowlist your own number** as a test recipient.
5. **Write a diagnostic command before the bot logic.** It should check token,
   subscription, fields and local config, and say which one is missing. This is
   the single highest-leverage thing you can build, and you want it *before*
   you need it. See [`references/diagnose.py`](references/diagnose.py).
6. Then the bot logic.
7. **Permanent token** once the flow works — it needs another admin's approval,
   so request it early.
8. **App Review / Coexistence** only when moving to a real number. Two things
   in that order, both easy to forget: get Advanced Access approved, **then
   publish the app to Live** — approval alone does nothing while the app sits
   in Development mode ([§8](#8-coexistence-and-app-review)).
9. **After a Coexistence connection, redo the setup against the new WABA.**
   The flow may have created its own, and the system-user assignment,
   `subscribed_apps`, and the IDs in your config all have to follow it. See the
   four-step checklist in [§8](#8-coexistence-and-app-review).

---

## 11. Working rules

- **Never print tokens or App Secrets** in logs, transcripts or screenshots. To
  compare values without exposing them: `... | sha256sum | cut -c1-12`.
- **Keep `.env` files and their copies out of the repo.** A `cp .env .env.bak`
  that `.gitignore` doesn't cover is the most common way credentials leak.
  Cover `.env*` and add a pre-commit hook that scans staged content.
- **Deleting the branch doesn't delete the object.** If a secret reached a
  push, the commit is still downloadable — **rotate the credential**.
- **Verify by content, not by status code.**
- **Keep project IDs in the project's own repo**, not in this skill. App ID,
  WABA ID, Phone Number ID and URLs differ per project and age fast.

---

## Contributing

This is field knowledge from a small number of production deployments. If
something here is wrong, out of date, or missing a case you hit, please open an
issue — especially for anything tagged **[field]**, which by definition has a
sample size of one.

When Meta changes something, updating the `last-verified` date matters as much
as the content: **a stale skill is worse than no skill**, because it sends
people down the wrong path with confidence.
