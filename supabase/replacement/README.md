# S.O.R.A. fixed database

For the reference-based 20-seat lounge map, apply `012_library_seat_layout.sql`
**after** `011`. It seeds the existing empty seats table and installs exclusive
five-minute seat holds without adding tables or columns. Existing seat records
and occupancy are preserved. Keep `012` last when installing/upgrading the kiosk
routines, since it replaces the older scan/state definitions in `011`.

For the UC-03/UC-04 kiosk update, apply the revised `011_kiosk_reading.sql` to the
existing database after the library card Boolean change. It uses the existing
tables and columns, adding only functions and a trigger. Activity events record
check-in, extra book scans and waitlist state in `session_activity_logs`. Follow
[the kiosk setup guide](../../docs/kiosk-reading.md) for prerequisites,
run instructions, behavior changes and verification. Fresh installations also
apply `011` after the base schema/access/reader operations (skip `010` because
`001` already contains the card Boolean).

This directory contains the PostgreSQL/Supabase definition used by the reader
and librarian applications. The internal schema name remains `sora_v2` so the
existing deployment configuration does not break; it is the current S.O.R.A.
database, not a second product version.

## Current structure

- `users.id` and `librarycard.librarycard_id` are database-generated UUIDs.
- Membership fields live directly on `users`; there is no separate current
  membership table.
- `users.is_active` controls access. `users.deactivated_at` remains a timestamp
  recording when an account was disabled.
- `librarycard.is_active` records whether a card is active and defaults to true.
  Card activation/deactivation operations should keep it consistent with
  `librarycard.deactivated_at`; adding this column alone does not change access checks.
- `ai_requests.request_prompt` stores the actual request instead of a summary.
  Validation status and rejection reason record the guardrail decision.
- All user relationships use the UUID `users.id` type.

## Files

1. `001_schema.sql` creates a new empty schema with the current 15-table design.
2. `002_access_draft.sql` installs Auth mapping, RLS, and AI guardrails.
3. `003_reader_operations_draft.sql` installs reader operations.
4. `004_staff_operations_draft.sql` installs librarian operations.
5. `005_bootstrap_librarian_template.sql` links the initial librarian.
6. `008_uuid_users_merge_memberships.sql` upgrades an already-installed older
   S.O.R.A. schema while preserving its rows.
7. `009_ai_identity_guardrail.sql` allows valid reader identity and profile
   questions while retaining all inappropriate and unrelated-request checks.
8. `010_librarycard_is_active.sql` adds the card Boolean to an existing database
   once, marking cards with a deactivation timestamp inactive. Fresh installations
   already include the column in `001_schema.sql` and should skip `010`.
9. `011_kiosk_reading.sql` adds the kiosk check-in, seat-selection, and barcode
   scanning operations. Run it after `010` on an existing database.

For an existing database, run `008` during maintenance, then rerun the updated
`002`, `003`, and `004` files in that order. Take a Supabase backup first. The
`000_*`, `006`, and `007` files document the earlier cutover and should not be
rerun as part of this upgrade.
