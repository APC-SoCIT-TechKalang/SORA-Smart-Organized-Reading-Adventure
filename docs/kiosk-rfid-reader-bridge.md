# Kiosk RFID reader bridge

The kiosk does not treat a screen touch as card authentication. It supports Web NFC for Android prototype tests and a trusted physical-reader bridge for production.

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
