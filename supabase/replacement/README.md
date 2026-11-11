# Updated ERD migration workspace

The project owner has since chosen to discard the current application data and
reuse the same Supabase project. See `SAME_PROJECT_RESET.md` for the current
approach. The preflight files below are retained for reference, not required
for a fresh-data reset.

`001_schema.sql` is a PostgreSQL translation of the user's `ERD-PBL.sql`.
Its tables and columns match that ERD. The only extra database objects are a
separate `sora_v2` namespace, the trigger needed to reproduce MySQL's automatic
`quests.updated_at` behavior, and row-level security. It does **not** replace
or change the current `public` tables.

`002_access_draft.sql` is the next implementation draft. It keeps the ERD's
tables and columns intact and uses a server-set Supabase Auth app metadata
claim to map an Auth UUID to the integer `users.user_id`. It is not ready to
run: account provisioning, replacement write functions, and app queries are
still required. Supabase must also be configured to expose `sora_v2` if it is
used through the Data API during testing.

## Why the current app cannot switch to this schema yet

The existing reader and staff apps use Supabase Auth UUIDs and query `public`
tables and RPCs. The ERD uses integer `users.user_id`, has no link to
`auth.users`, and stores `password_hash` itself. A direct table-name switch
would break login and row ownership.

| Current app data | Updated ERD destination | Issue to resolve |
| --- | --- | --- |
| `profiles` and `auth.users` | `users` | UUID to integer ID mapping; required username, birthdate, mobile number |
| `books`, `book_genres` | `authors`, `books` | One author and one genre per book; new numeric age and volume fields |
| `book_copies`, `shelves` | `book_copies` | Shelf and extra copy statuses have no destination |
| `memberships`, `membership_types` | `memberships` | Unlimited minutes and open-ended expiry are not allowed by the ERD |
| `library_cards` | `librarycard` | Card status and artwork have no destination |
| `visits`, `seat_assignments`, `reading_logs` | `sessions`, `seats` | Unregistered walk-ins, check-in without a book, multiple books per visit, and historical seat gaps. Registered `Wanderer` users can have sessions. |
| `quests`, `quest_progress` | `quests`, `user_quests` | Quest categories, status, and requirement data have no direct equivalent |
| `reader_progress`, `points_ledger` | `user_quests`, `redemptions`, `rank_history` | Current balance, the current streak value, and non-quest point transactions have no destination; no streak history was present in the updated ERD. |
| Kiosk login tables and RPCs | No ERD table | Kiosk login requires the existing support system |

## Safe order of work

1. Run `000_preflight_summary.sql` in the existing Supabase project's SQL Editor.
   It returns one read-only results table showing records that the exact ERD
   cannot hold. Use `000_preflight_values.sql` to inspect the distinct rating,
   book type, seat, and membership values without exposing personal details.
   Use `000_preflight.sql` for other detailed checks when a count is nonzero.
2. Review the results and decide how the unsupported data and features will be
   handled. Do not discard records silently.
3. Create a database backup or a separate staging project before copying data.
4. Apply `001_schema.sql` only as an isolated schema after review. It is not a
   replacement for the existing migrations and the apps cannot use it yet.
5. Write and test explicit data mappings, Auth integration, RLS policies, and
   replacement RPCs; then update both apps and test complete workflows.
6. Cut over only after record counts and all workflows match. Keep the current
   deployment and database available for rollback.

No SQL in this directory should be added to the active `supabase/migrations`
folder or run as a production cutover without the data mappings and app changes.
