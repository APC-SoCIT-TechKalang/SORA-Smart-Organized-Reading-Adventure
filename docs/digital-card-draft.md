# Digital reader card and QR kiosk login

Open **Account menu → My digital card** while signed in with an activated
reader account and an active, unexpired membership. This item is hidden for
readers awaiting activation, expired or suspended members, and while access
cannot be verified. The dialog independently checks the same access state.
The dialog shows the current reader's profile name and rank when available,
falling back to their account email while the profile is unavailable.
It is available in development and production builds.

The card loads the activated reader's current library-card identifier and
renders it as a Tankobonbon QR login payload on the back of the card. Select or
tap the card to flip it. The kiosk's **Scan digital card** action reads the QR
with the device camera and submits the identifier through the same server-side
account, membership, and card checks used by the physical RFID reader. A
successful check creates the kiosk's short-lived Supabase session.

Readers without an active issued library card see an actionable unavailable
state instead of a login credential. Camera scanning requires a browser with
the Barcode Detector API and camera access; the physical reader remains
available as a fallback. Closing the dialog returns the reader to the current
library page.
