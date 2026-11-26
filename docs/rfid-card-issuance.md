# Print and link reader RFID cards

Open **Readers → Print and link RFID cards**, below the account activation form.
Printing lists active reader accounts, including readers awaiting membership
activation. Linking lists only active readers without an active card with a
saved RFID UID. Inactive accounts must be reactivated first.

Membership activation requires the reader, membership plan, and expiry date.
It preserves existing card records and does not ask staff to enter an RFID UID.
Use **Link RFID UID** separately when issuing a physical card.

## Print RFID card

1. Select **Print RFID card**.
2. Choose the reader's name. Their personalized card opens the print dialog
   automatically. Allow pop-ups for the admin site if your browser blocks it,
   then select **Print again**.
3. Choose your card printer. Use an 85.6 × 53.98 mm card, actual size (100%),
   and no browser headers or footers.

The printout contains the reader's name, membership, reader ID, and linked RFID
UID when one is available. A card can be printed before linking its UID; link
first if the UID should appear on the printout. Only the card is printed.
The browser requires its print dialog; the app cannot silently choose a printer
or confirm that a physical card was printed.

## Link RFID UID

1. Select **Link RFID UID**, beside the print button.
2. Choose the reader's name. The dialog begins waiting for a tap.
3. Keep the browser focused and tap the physical card on the USB RFID reader.
   The reader must type the UID followed by Enter/CR.
4. Wait for **Card linked** and the saved UID. Select **Done**, or choose another
   reader to issue another card.

Readers who already have an active linked UID are hidden from this dropdown.
A reader disappears from the list as soon as their card is saved. If everyone
has a linked card, the dialog displays an empty state. A card record without a
UID, or a deactivated card, does not prevent a reader from appearing.

This reads the card's built-in UID and associates it with the selected reader
in `sora_v2.librarycard`; it does not rewrite the chip's UID. Leading zeroes are
preserved. A card already assigned to another reader is rejected. To replace an
existing linked card, open that reader's **View details**, update **Assigned card
UID**, and select **Save changes**. Membership activation remains a separate
action, and an unexpired membership is required for kiosk access.

**Cancel waiting**, closing the dialog, or leaving Readers stops listening.
No account is changed until a reader is selected and a valid tap is received.
Digital ID QR payloads are rejected by this action.

This uses the existing `sora_v2.admin_assign_library_card` function from
`supabase/replacement/023_realtime_library_card_sync.sql`, including its librarian
permission and duplicate-card checks. Install that existing migration if it has
not yet been applied. No new database migration is required for these controls.
