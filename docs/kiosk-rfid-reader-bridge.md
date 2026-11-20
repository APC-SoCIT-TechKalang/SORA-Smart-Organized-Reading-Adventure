# Kiosk RFID reader bridge

The kiosk does not treat a screen touch as card authentication. It supports Web NFC for Android prototype tests and a trusted physical-reader bridge for production.

## Windows USB keyboard readers (local development kiosk)

The kiosk captures rapid keyboard scans ending in Enter or Tab automatically,
including before Start card reader is pressed. Keep the browser window focused.
USB recognition alone does not mean a card has been read. To check the hardware,
open Notepad and tap a card: a keyboard reader should type its identifier. Configure
the reader for an Enter/CR suffix if necessary. Slow manual typing is ignored;
scan timing is input filtering, not a security boundary or proof of card ownership.

Run `supabase/replacement/014_kiosk_rfid_login.sql` in Supabase SQL Editor.
This installs the service-role-only resolver for the active `sora_v2` schema;
the older public-schema RFID migration does not configure this schema.

Configure the following in `apps/admin-dashboard/.env.local`:

```dotenv
SUPABASE_SECRET_KEY=your_supabase_secret_or_service_role_key
KIOSK_RFID_BRIDGE_KEY=your_long_random_reader_bridge_key
```

Put the same `KIOSK_RFID_BRIDGE_KEY` in `apps/BONBON UI USER/.env.local`.
Neither secret may use a `VITE_` or `NEXT_PUBLIC_` prefix or be committed.
Restart both development servers. Start admin on `127.0.0.1:3000`, reader on
`127.0.0.1:5173`, and open `http://127.0.0.1:5173/kiosk`.

The reader's **server-side** development proxy adds the bridge credential and
forwards login to the admin API. It accepts only same-origin POSTs from loopback;
this proxy must not be exposed as a public kiosk authentication endpoint.
Production needs the trusted native bridge described below.

For the hosted reader kiosk, the same-origin serverless endpoint lives in
`apps/BONBON UI USER/api/kiosk-rfid-login.ts`. Add `SUPABASE_SECRET_KEY` to the
**reader site's server-side deployment environment** and redeploy. The endpoint
checks same-origin requests, limits repeated scans, validates the card through
the service-role-only resolver, and returns only a one-time Auth token. The
secret is never included in the Vite bundle. Vercel resolves the API function
before falling back to the catch-all SPA rewrite.

The scanned value must exactly match `sora_v2.librarycard.librarycard_rfid`,
including leading zeroes. The card, reader account, and membership must be active,
and membership must be unexpired. The Supabase Auth account must have its
`app_metadata.sora_user_id` linked to that reader. Login does not bypass the
separate librarian check-in approval. Unknown cards never create Auth accounts.

## Production bridge contract

1. The bridge reads the physical card and POSTs `{ "rfidUid": "<card value>" }` to `/api/kiosk/rfid-login` with `x-kiosk-reader-key: <KIOSK_RFID_BRIDGE_KEY>`.
2. After the card, profile, and membership are validated, it receives `{ tokenHash, account }`.
3. It passes the result to the kiosk webview:

```js
window.dispatchEvent(new CustomEvent('sora:rfid-auth', { detail: { tokenHash, account } }));
```

The browser exchanges the one-time token with Supabase Auth. It never needs the bridge secret and never accepts manually typed card IDs.

## Device support

- Android Chrome can prototype with NTAG215 NDEF **Text** content equal to `library_cards.rfid_uid`.
- iPhone/iPad browsers do not expose general Web NFC. Use the bridge (USB/Bluetooth reader or native kiosk wrapper) for a real in-page tap.
- An NDEF URL can open a page on iOS, but is not used as authentication because a static URL can be copied.
