# S.O.R.A. fixed database update

## Teacher and classmate feedback applied

- Combined membership data into `users`, leaving 15 application tables and no
  separate current membership table.
- Changed `users.id` and `librarycard.librarycard_id` to database-generated
  UUIDs and updated every related foreign key and application call to use
  strings/UUIDs.
- Kept `deactivated_at` as a timestamp and added the separate Boolean
  `is_active`. Login, RLS, reader operations, and librarian controls respect the
  active status.
- Replaced AI summary columns with `request_prompt` and `response_text`.
  Requests now record a category, validation result, optional rejection reason,
  and completion time.
- Added AI request length, scope, prompt-injection, secret-access, destructive
  command, harmful-content, and rate-limit guardrails.
- Updated reader creation, profile loading, membership activation, top-ups,
  sessions, quests, and Supabase Auth metadata for UUID users.

## Database update path

For a new database, run `001` through `005`. For the existing S.O.R.A. database,
run `008_uuid_users_merge_memberships.sql`, then rerun `002`, `003`, and `004`.
The migration preserves existing rows and remaps Auth metadata from the former
integer user IDs to the generated UUIDs.

The schema remains internally named `sora_v2` only to preserve the current
Supabase Data API and Vercel configuration.
