# S.O.R.A. fixed database update

## Objective

Convert the team's revised MySQL ERD to Supabase PostgreSQL while preserving
the 16 requested tables and preparing the current reader and librarian apps to
use the fixed database. Existing test data was intentionally not migrated.

## Completed

- Translated all 16 MySQL tables to PostgreSQL under an isolated internal
  schema, then completed the verified production cutover.
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
- Added feature flags so the applications use the fixed database deliberately.
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

## Cutover status

The fixed database is installed in the Supabase project. Verification returned
16 ERD tables, one linked librarian, one remaining Auth account, and zero
legacy application tables. The admin now provisions reader Auth accounts and
ERD user records together.

## Safe demonstration sequence

1. Show `001_schema.sql` and the 16-table ERD design.
2. Show `002_access_draft.sql` for Auth and RLS.
3. Show `003_reader_operations_draft.sql` and
   `004_staff_operations_draft.sql` for business operations.
4. Show that both applications build while the feature flags remain off.
5. Demonstrate that the legacy application tables were removed only after the
   fixed database, account link, and access controls were verified.
