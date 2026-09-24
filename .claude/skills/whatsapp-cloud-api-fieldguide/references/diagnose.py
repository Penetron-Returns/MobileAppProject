#!/usr/bin/env python3
"""Diagnose a WhatsApp Cloud API configuration.

A starting point to copy into a new project. Depends only on `httpx` (or
`requests`, changing two lines) and these environment variables:

    WHATSAPP_TOKEN            access token
    WHATSAPP_PHONE_NUMBER_ID  the sending number
    WHATSAPP_WABA_ID          the WhatsApp Business Account
    WHATSAPP_APP_SECRET       (optional) to check webhook field subscriptions
    WHATSAPP_VERIFY_TOKEN     (optional) to test the handshake
    WEBHOOK_URL               (optional) to test the handshake

    python diagnose.py         # report only
    python diagnose.py --fix   # also subscribe the WABA and the fields

## Why write this BEFORE the bot logic

The three most common Cloud API failures **produce no error**: the WABA not
subscribed to the app, webhook fields not subscribed, and an expired token.
All three look identical from the outside — silence — and each is one API call
to diagnose.

Having this before you need it is the difference between a minute and an
afternoon.

## Design note: "couldn't check" is not "missing"

`GET /{app-id}/subscriptions` requires an **app access token**
(`{app_id}|{app_secret}`), not a user token. An earlier version of this script
treated the resulting 400 as "no fields subscribed" and reported a problem that
did not exist — sending the reader to hunt for nothing. For a diagnostic tool
that is the worst possible bug, so the two states are now distinguished
explicitly.
"""

from __future__ import annotations

import contextlib
import os
import sys

import httpx

# On Windows, `sys.stdout` defaults to cp1252 while terminals decode UTF-8:
# accented characters render as garbage, or raise UnicodeEncodeError on older
# consoles. A diagnostic tool that is hard to read is a tool nobody runs.
for _stream in (sys.stdout, sys.stderr):
    with contextlib.suppress(Exception):
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

API = os.getenv("WHATSAPP_API_BASE", "https://graph.facebook.com/v26.0")

OK = "  [ ok ] "
BAD = "  [FAIL] "
INFO = "  [ -- ] "

#: Fields a replying bot needs. `smb_message_echoes` only if you use
#: Coexistence (a human also sends from the same number).
FIELDS = "messages,smb_message_echoes"


def _err(resp: httpx.Response) -> str:
    try:
        e = resp.json().get("error", {})
        return f"{e.get('message', resp.text)} (code {e.get('code', resp.status_code)})"
    except Exception:
        return resp.text[:200]


def _check_token(cli: httpx.Client, token: str) -> None:
    print("\n1) Token")
    r = cli.get(f"{API}/debug_token", params={"input_token": token, "access_token": token})
    if r.status_code != 200 or "data" not in r.json():
        print(f"{INFO}Could not inspect the token: {_err(r)}")
        return
    d = r.json()["data"]
    expires = d.get("expires_at")
    print(f"{OK}Type {d.get('type')} — expires: {expires or 'NEVER'}")
    print(f"{INFO}Scopes: {', '.join(d.get('scopes', [])) or '(none)'}")
    if expires:
        print(f"{INFO}This is a temporary token: it lasts 24h. For production,")
        print(f"{INFO}generate a system-user token (needs another admin's approval).")


def _check_number(cli: httpx.Client, phone_id: str) -> bool:
    print("\n2) Phone number")
    r = cli.get(f"{API}/{phone_id}", params={"fields": "display_phone_number,verified_name"})
    if r.status_code != 200:
        print(f"{BAD}Could not query it: {_err(r)}")
        print(f"{INFO}Usually an expired token or the wrong Phone Number ID.")
        return False
    d = r.json()
    print(f"{OK}{d.get('display_phone_number')} — {d.get('verified_name', '')}")
    return True


def _check_subscription(cli: httpx.Client, waba_id: str, fix: bool) -> tuple[int, str]:
    """Returns (problems, app_id). The app id is reused by the next check."""
    print("\n3) WABA subscribed to the app  <- the step that appears on no screen")
    if not waba_id:
        print(f"{BAD}WHATSAPP_WABA_ID missing; cannot check.")
        return 1, ""

    r = cli.get(f"{API}/{waba_id}/subscribed_apps")
    if r.status_code != 200:
        print(f"{BAD}Could not query: {_err(r)}")
        return 1, ""

    subscribed = r.json().get("data", [])

    # Identify the app that owns the token. With a WABA shared across apps,
    # "some apps are subscribed" does not tell you whether YOURS is.
    mine_resp = cli.get(f"{API}/app", params={"fields": "id,name"})
    mine = mine_resp.json() if mine_resp.status_code == 200 else {}
    my_id = str(mine.get("id", ""))

    ids = set()
    for app in subscribed:
        info = app.get("whatsapp_business_api_data", {})
        ids.add(str(info.get("id", "")))
        print(f"{INFO}Subscribed: {info.get('name', '(unnamed)')} (id {info.get('id')})")

    if my_id and my_id in ids:
        print(f"{OK}Yours is subscribed ({mine.get('name')}, id {my_id}).")
        return 0, my_id

    print(f"{BAD}YOUR app ({mine.get('name')}, id {my_id}) is NOT subscribed.")
    print(f"{INFO}Without this, messages NEVER arrive and Meta reports no error.")
    if fix:
        add = cli.post(f"{API}/{waba_id}/subscribed_apps")
        if add.status_code == 200 and add.json().get("success"):
            print(f"{OK}Subscribed.")
            return 0, my_id
        print(f"{BAD}Could not subscribe: {_err(add)}")
    return 1, my_id


def _check_fields(app_id: str, fix: bool) -> int:
    """Webhook field subscriptions. Needs an APP access token, not a user one."""
    print("\n4) Webhook fields  <- different from the previous check")
    app_secret = os.getenv("WHATSAPP_APP_SECRET", "")

    if not app_id:
        print(f"{INFO}Could not identify the app; skipping.")
        return 0
    if not app_secret:
        print(f"{INFO}Without WHATSAPP_APP_SECRET this cannot be queried — the")
        print(f"{INFO}endpoint requires an app token. Whether `messages` is")
        print(f"{INFO}subscribed is UNKNOWN, which is not the same as missing.")
        return 0

    app_token = f"{app_id}|{app_secret}"
    r = httpx.get(
        f"{API}/{app_id}/subscriptions", params={"access_token": app_token}, timeout=20.0
    )
    if r.status_code != 200:
        print(f"{INFO}Could not query: {_err(r)}")
        return 0

    fields: list[str] = []
    for sub in r.json().get("data", []):
        fields += [f.get("name") for f in sub.get("fields", [])]

    if "messages" in fields:
        print(f"{OK}Subscribed to: {', '.join(sorted(set(fields)))}")
        return 0

    print(f"{BAD}`messages` is missing. Without it no message arrives.")
    print(f"{INFO}Changing the webhook URL can reset this.")
    if fix:
        add = httpx.post(
            f"{API}/{app_id}/subscriptions",
            params={
                "object": "whatsapp_business_account",
                "callback_url": os.getenv("WEBHOOK_URL", ""),
                "verify_token": os.getenv("WHATSAPP_VERIFY_TOKEN", ""),
                "fields": FIELDS,
                "access_token": app_token,
            },
            timeout=20.0,
        )
        if add.status_code == 200:
            print(f"{OK}Fields subscribed: {FIELDS}")
            return 0
        print(f"{BAD}Could not subscribe: {_err(add)}")
    return 1


def _check_handshake() -> int:
    """The verification handshake, from outside — exactly as Meta does it."""
    url, verify = os.getenv("WEBHOOK_URL", ""), os.getenv("WHATSAPP_VERIFY_TOKEN", "")
    if not (url and verify):
        return 0

    print("\n5) Webhook handshake (as Meta performs it)")
    challenge = "diagnose-123"
    try:
        r = httpx.get(
            url,
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": verify,
                "hub.challenge": challenge,
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        print(f"{BAD}Could not reach the URL: {exc}")
        return 1

    if r.text.strip() == challenge:
        print(f"{OK}Returned the challenge verbatim.")
        return 0

    print(f"{BAD}HTTP {r.status_code}, returned: {r.text[:120]!r}")
    print(f"{INFO}A 200 with HTML is usually your SPA answering a route that")
    print(f"{INFO}doesn't exist. Compare content, not status codes.")
    return 1


def main(fix: bool) -> int:
    token = os.getenv("WHATSAPP_TOKEN", "")
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
    waba_id = os.getenv("WHATSAPP_WABA_ID", "")

    required = (("WHATSAPP_TOKEN", token), ("WHATSAPP_PHONE_NUMBER_ID", phone_id))
    missing = [name for name, value in required if not value]
    if missing:
        print(f"{BAD}Missing environment variables: {', '.join(missing)}")
        return 1

    problems = 0
    with httpx.Client(headers={"Authorization": f"Bearer {token}"}, timeout=20.0) as cli:
        _check_token(cli, token)
        if not _check_number(cli, phone_id):
            return 1
        sub_problems, app_id = _check_subscription(cli, waba_id, fix)
        problems += sub_problems
        problems += _check_fields(app_id, fix)

    problems += _check_handshake()

    print()
    if problems:
        print(f"{problems} item(s) still to resolve.")
        if not fix:
            print("Try --fix for the ones that can be automated.")
        return 1
    print("Everything checks out on Meta's side.")
    return 0


if __name__ == "__main__":
    sys.exit(main(fix="--fix" in sys.argv))
