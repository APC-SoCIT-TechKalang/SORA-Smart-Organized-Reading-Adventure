# Same-project reset plan

The project owner chose to keep the current Supabase project, discard its
application records, and install the updated ERD. There is no need to map old
rows into the new tables. `000_preflight*.sql` and `DATA_AUDIT.md` remain as
records of the earlier data-transfer assessment.

## What this changes

The current project's `public` tables, policies, functions, and app data would
be replaced. Supabase Auth accounts and Storage objects live outside those
tables and require an explicit separate decision; dropping application tables
does not reset them. Keeping Auth accounts without matching application `users`
rows would leave those accounts unable to use the new application schema.

The attached ERD must still be translated from MySQL to PostgreSQL. The
translation in `001_schema.sql` is isolated under `sora_v2` for review. It is
not a reset script and the current apps do not use it.

## Work required before a reset can keep the app working

1. Define account creation and ownership between Supabase Auth UUIDs and the
   ERD's integer `users.user_id`, without changing the requested ERD.
2. Implement RLS policies and database functions for reader and librarian
   actions. The translated tables currently have no browser access policies.
3. Rewrite the reader site, admin dashboard, and kiosk calls from the old
   table/column names and RPCs to the new schema.
4. Remove current features that have no representation in the exact ERD:
   check-in without a book, unregistered walk-in visits, shelf locations,
   kiosk login requests, multi-genre books, and the current streak display.
   A registered user with a `Wanderer` membership can still be served as a
   walk-in. The project owner chose to remove unsupported features.
5. Build and test the replacement against a disposable Supabase environment.
6. Save a restorable backup of the old project, even if its records will not
   be imported. This preserves the previously requested rollback option.
7. Run one reviewed cutover script against the current project, recreate the
   necessary accounts and reference data, update the apps, and verify the
   complete workflows.

## Current state

No reset, data deletion, or schema installation has been run in Supabase.
Removing the old records alone would break the current apps because their
queries and Auth flow still depend on the old schema.
