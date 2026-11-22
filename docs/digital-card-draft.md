# Digital reader card draft

Open **Account menu → My digital card** while signed in with an activated
reader account and an active, unexpired membership. This item is hidden for
readers awaiting activation, expired or suspended members, and while access
cannot be verified. The dialog independently checks the same access state.
The dialog shows the current reader's profile name and rank when available,
falling back to their account email while the profile is unavailable.
It is available in development and production builds.

The card is a visual draft. It does not issue a credential, generate a card
number, emulate NFC, or call the kiosk login endpoint. The card status is
**Not issued**, the NFC status is **Not connected**, and the NFC action is
disabled. Closing the dialog returns the reader to the current library page.

Actual phone tap login still needs a supported phone card-emulation solution,
confirmed reader hardware compatibility, and server credential verification.
The existing physical-card kiosk flow is separate from this preview.
