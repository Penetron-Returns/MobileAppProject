# Changelog

All notable changes to this skill are documented here.

Because this skill describes a third-party platform that changes without
notice, **each release records what was verified and when**. A stale skill is
worse than no skill — it sends you down the wrong path with confidence — so
the verification date is treated as content, not metadata.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.1] — 2026-09-03

Closes the one item 1.1.0 shipped unverified.

### Verified against Meta's documentation

- **Flow JSON 7.3 is current**, and marked *Recommended*. The changelog's own
  "Updated" stamp reads 2025-11-07, so 7.3 has been current for about ten
  months — stable, not merely unchecked.
- **Nothing has expired yet.** Every version back to 2.1 can still be sent.

### Added

- **The supported-version table is two lists, and the gap between them is what
  "frozen" means.** Publishing accepts 5.1 and 6.0–7.3; sending also accepts
  2.1, 3.0, 3.1, 4.0 and 5.0. Those five are frozen: sendable, not publishable.
- **`data_api_version` and message version**, which the skill had ignored in
  favour of Flow JSON alone. Data API **4.0** (recommended) added two-signature
  authentication for Flow endpoints — platform-side verification plus an
  optional flow token signature. Message version **3**.
- **The changelog returns HTTP 500 to every programmatic client** while
  rendering normally in a browser. A scripted freshness check will report it
  permanently down; open it in a browser instead.

[1.1.1]: https://github.com/guisa17/whatsapp-cloud-api-skill/releases/tag/v1.1.1

## [1.1.0] — 2026-09-03

Re-verified against Meta's documentation, and added field findings from
connecting a real number through Coexistence on 2026-08-31.

### Added

- **Coexistence: Advanced Access is inert while the app is in Development
  mode.** `missing required Graph API permissions for Cloud API companion
  pairing` was raised with all permissions already approved at Advanced Access;
  the actual cause was the app being unpublished. Publishing it to Live fixed
  it with no permission change.
- **Coexistence: Embedded Signup creates its own WABA**, rather than using an
  empty one pre-created and passed to it. This can leave two WABAs with
  near-identical names, one of them invisible to the app — picking the wrong
  one returns only "not a valid business identifier".
- Post-connection guidance: read the WABA ID back from the API instead of
  trusting the one you planned to use, and check `platform_type` is
  `CLOUD_API`.
- The documentation URL restructure: WhatsApp docs moved to
  `/documentation/business-messaging/whatsapp/`, and old `/docs/whatsapp/`
  paths 404 or serve stale copies.
- App Review timing as a single data point: 12 days, approved on first
  submission, against the 20 days Meta's panel advertises.
- A four-step post-connection checklist in §8: assign the system user to the
  new WABA **and** the new number, `subscribed_apps` on the new WABA, update
  the IDs in your config, then prove it with a real message. All four have to
  be redone against the WABA the flow created, and skipping any one produces
  the same silence.
- Six rows in the symptom→cause table for the above.

### Changed

- The **14-day inactivity rule** moves from `[field]` to `[verified]` — it is
  documented as the `PRIMARY_INACTIVITY` offboarding reason.
- The **Tech Provider** requirement is now stated as Advanced access to *both*
  `whatsapp_business_messaging` and `whatsapp_business_management`.
- The Coexistence path gained a step: `… → Advanced Access → App published
  (Live) → Coexistence`.
- WhatsApp Business app **2.24.17+** requirement added as `[verified]`.
- Flow JSON version-state rules now quote Meta's actual 90-day wording, and
  note that the 12-month support window quoted by third parties is not in
  Meta's docs.

### Verified against Meta's documentation (2026-09-03)

Re-checked; **unchanged since 1.0.0**:

- Graph API is still on **v26.0** (released 2026-07-29).
- Pricing is still **per message** since 2025-07-01; non-template messages and
  utility templates inside an open customer service window are still free.
- Flow JSON versions still freeze, then expire, with ~90 days' notice.

### Corrected

- **The free 24-hour window really is ending, and 1.0.0 was wrong to call it
  `[unconfirmed]`.** It is documented — just not on the pricing page. A
  separate page, `…/whatsapp/pricing/non-template-messages`, states that on
  **2026-10-01** Meta begins charging for **service messages** ("not charged
  since November 2024") and for **utility templates sent in response to users
  inside an open 24-hour window** ("not charged since July 1, 2025"), at
  utility/authentication rates. A **Meta Business Agent** per-token charge
  started **2026-08-01**. §7 now carries this as `[verified]`.
- The failure mode behind that mistake is worth naming: Meta splits *current*
  and *upcoming* pricing across pages, and the main pricing page still
  describes today's model with no hint that it changes in four weeks. §7 warns
  against reading only that page.

### Deliberately not included

- The **12-month** Flow JSON support window quoted by third-party guides.
  Meta's versioning page states 90 days' notice and no such window.

## [1.0.0] — 2026-08-26

First release. Verified against **Graph API v26.0**.

### Added

- The three invisible steps: WABA→app subscription, webhook field
  subscription, and test-number recipient allowlisting. None of them produce
  an error when missing.
- Token guidance: temporary vs system-user, the two-person approval
  requirement, and why token types are not interchangeable.
- Webhook correctness: raw-body signature validation, constant-time
  comparison, responding 200 before processing, deduplicating by
  `wa_message_id`.
- Flows: publishing by API, version freeze/expiry lifecycle, and the gotchas
  (immutability, empty `data: {}`, `mode` mismatch, unquoted numeric inputs).
- Limits table and pricing model.
- Coexistence and App Review, including the Tech Provider prerequisite.
- Symptom→cause table keyed by Meta error codes.
- `references/diagnose.py`, a standalone diagnostic covering the invisible
  steps and the verification handshake.

### Verified against Meta's documentation

Corrections made while writing, against beliefs that were out of date:

- Pricing has been **per message since 2025-07-01**, not per conversation.
- Flow JSON versions **freeze** and then **expire**; an expired version means
  existing Flows can no longer be opened.
- The **On-Premises API was fully sunset on 2025-10-23**.
- Latest Flow JSON at time of writing: **7.3**.

### Deliberately not included

Widely repeated third-party claims that the free 24-hour service window ends
on 2026-10-01 are **not present in Meta's pricing documentation**. They are
tagged `[unconfirmed]` rather than stated as fact.

[1.1.0]: https://github.com/guisa17/whatsapp-cloud-api-skill/releases/tag/v1.1.0
[1.0.0]: https://github.com/guisa17/whatsapp-cloud-api-skill/releases/tag/v1.0.0
