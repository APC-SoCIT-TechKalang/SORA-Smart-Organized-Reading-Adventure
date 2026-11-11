# S.O.R.A. database replacement update

## Objective

Convert the team's revised MySQL ERD to Supabase PostgreSQL while preserving
the 16 requested tables and preparing the current reader and librarian apps to
use it. Existing test data will not be migrated. The same Supabase project may
be reused only after the replacement has been tested.

## Completed

- Translated all 16 MySQL tables to PostgreSQL under an isolated `sora_v2`
  schema. Existing `public` tables and data remain untouched.
- Preserved the ERD's table and column structure. PostgreSQL checks replace
  MySQL enums, identity columns replace `AUTO_INCREMENT`, and a trigger
  replaces MySQL's automatic `updated_at` behavior.
- Added row-level security and a Supabase Auth mapping. Auth passwords stay in
  Supabase Auth; the ERD's nullable `password_hash` is not used.
- Kept registered walk-ins through the `Wanderer` membership type.
- Defined reader operations for starting/finishing one active reading session,
  joining and claiming quests, and computing points from existing ERD data.
- Defined librarian operations for memberships, top-ups, shelving, catalog
  records, copies, quests, and quest verification.
- Added a protected server endpoint for librarians to create a Supabase Auth
  account and matching integer ERD user record.
- Added feature flags so current deployments continue using the old schema
  until the replacement is enabled deliberately.
- Removed replacement-mode kiosk approval and check-in controls that the exact
  ERD cannot store. A reading session begins when a registered reader starts a
  book and receives an available seat.

## Verification performed

- All four core SQL files parsed successfully in an isolated PostgreSQL engine.
- Exercised reader isolation, denied reader access to librarian operations,
  denied direct browser catalog writes, start/finish reading, minute deduction,
  return-cart shelving, top-up, quest enrollment, verification, claim, and
  point balance.
- Reader application production build passed.
- Admin application production build and TypeScript checking passed.

## Current limitation

The replacement is not deployed to the live Supabase project yet. The code and
SQL are prepared behind feature flags so the live project is not changed until
the team deliberately applies and tests the replacement scripts.

## Safe demonstration sequence

1. Show `001_schema.sql` and the `sora_v2` table design.
2. Show `002_access_draft.sql` for Auth and RLS.
3. Show `003_reader_operations_draft.sql` and
   `004_staff_operations_draft.sql` for business operations.
4. Show that both applications build while the feature flags remain off.
5. Apply and test the files in `sora_v2`; only reset `public` after all admin
   forms and end-to-end workflows pass.
