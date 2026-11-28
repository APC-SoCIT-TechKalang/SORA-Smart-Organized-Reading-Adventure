# Production deployment

## Architecture

The reader site and staff dashboard are separate deployments. Supabase is the
backend: it provides PostgreSQL, authentication, storage, row-level security
(RLS), and RPC functions. The admin dashboard also has one same-origin Next.js
route, `/api/catalog/lookup`, which calls public book metadata providers.

| Component | Directory | Deploy type | Build command |
| --- | --- | --- | --- |
| Reader site | `apps/bonbon-ui-user` | Static Vite site | `npm ci && npm run build` |
| Staff dashboard | `apps/admin-dashboard` | Node.js Next.js service | `npm ci && npm run build`, then `npm start` |
| Database/backend | `supabase` | Supabase project | Apply migrations in numeric order |

Do not deploy `apps/admin-dashboard` as a static export: its ISBN route requires a
Node.js runtime. The reader site can be hosted independently on any static host.

## Environment variables

Set variables in each deployment's own environment settings. Public Supabase
publishable keys are intended for browser use; the Supabase service-role/secret
key must never be placed in either frontend build or committed to the repository.

| Deployment | Required variables |
| --- | --- |
| Reader site | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-side RFID function only) |
| Admin dashboard | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SORA_SCHEMA` (defaults to `sora_v2`; set to `public` only for a legacy database) |
| Admin dashboard, optional | `GOOGLE_BOOKS_API_KEY` |

Use the matching `.env.example` only for local development. `VITE_*` and
`NEXT_PUBLIC_*` values are embedded in browser code at build time, so rebuilding
is required after changing them. For the replacement database, configure
Supabase's API settings to expose the `sora_v2` schema, then rebuild and
redeploy the admin dashboard. Its librarian login check calls
`sora_v2.is_librarian`; it must not use the removed `public.has_role` RPC.

## Supabase configuration

1. Apply `supabase/migrations/001_initial_schema.sql` through
   `008_repair_auth_profiles.sql` to a staging project, then production.
   Run `seed.sql` before `003_application_integration.sql` so the reader role
   and starting rank are available to the Auth trigger. Migration 008 is
   idempotent and repairs Auth users that are missing their `profiles` row.
2. Configure Supabase Auth **Site URL** and **Additional Redirect URLs** for the
   reader site's production URL, preview URL if used, and local development URL.
   Email confirmation uses the reader site's current origin.
3. In Supabase Auth URL configuration, allow both deployed origins. In the API
   CORS configuration, allow the reader and admin origins (and only those
   origins), plus local development origins when needed.
4. Create staff users through Supabase Auth and assign the `admin` role in the
   application database. Do not expose a registration flow for staff accounts.
5. Confirm RLS remains enabled after every migration. Browser clients use the
   publishable key and rely on RLS plus the role-checked RPC functions.
6. Create the `book-covers` storage bucket before using cover uploads. The
   migration grants public reads and administrator-only writes.

## Release checks

Run the following from each application directory with Node.js 20.9 or newer:

```powershell
npm ci
npm run build
```

After deployment, verify reader sign-up and email confirmation, reader sign-in,
admin sign-in, a role-protected admin write, image upload, and ISBN lookup. Use
separate Supabase projects for staging and production; never point previews at
the production database.

## Operational guidance

Supabase manages database connection pooling for browser and API requests; this
repository does not open raw PostgreSQL connections. Monitor Supabase Auth,
Database, Storage, and API logs, along with Next.js server logs for the admin
route. Keep database migrations append-only and run them through a reviewed
deployment process.

## Book shelf locations (UC-08, UC-09, UC-10)

For the active `sora_v2` schema, apply
`supabase/replacement/013_book_shelf_locations.sql` after `012` and before
deploying the updated reader and admin apps. This migration adds home shelf
locations and condition notes to physical copies and supports On Hold and
Damaged statuses alongside the existing kiosk statuses.

The five shelf units are A1 through A5 from left to right in the Main Reading
Hall, below Center Seating and above Reception. New copies require a shelf.
Existing unknown locations remain null so the application does not invent a
physical location. Staff must inspect these copies and assign their actual
shelves using Book Management → Shelf / status; the table marks them Shelf
missing until assigned. Titles without copies need a physical copy added.
In Book Management, these titles show "No physical copies"; Shelf / status
offers a copy registration form. Staff must check the physical item, scan its
unique barcode, and select its actual shelf. The existing
`admin_add_located_copy` function adds one copy to the existing title and
rejects duplicate barcodes; it does not change the title metadata or assign
invented locations.

Book Details lists locations per copy, highlights only copies currently in
shelf, and refreshes with the catalog's existing polling. Copies with readers,
on hold, on the return cart, or damaged never highlight their home shelf.
Shelf information follows the existing signed-in availability access policy.
Librarians can record condition notes and damage charges against unsettled
reader sessions; borrowing remains tied to kiosk sessions.

## UC-09 Add New Books

Apply `supabase/replacement/017_uc09_add_books.sql` after
`016_refresh_existing_catalog_metadata.sql` before deploying the updated admin
dashboard. It adds the `sora_v2.admin_register_books` function without altering
existing book or copy rows. Book Management's Add Book and Bulk Add actions use
this function. Each submitted row represents one verified physical copy. The
database checks the ISBN and mandatory fields, reuses an existing ISBN's book
record, assigns the next copy number, generates an `ISBN-copy number` barcode,
and starts the copy In-Shelf at the selected home shelf. A bulk batch of up to
100 rows runs in one transaction: if any row fails, none of its rows are saved.
After saving, print the Code 128 labels from the confirmation screen or reprint
them from the catalogue. Bulk Add accepts CSV/TSV with
`isbn,title,author,genre,tags,book_type,age_rating,shelf` headers or manual rows.

## Per-book returns and UC-05 checkout

Apply `supabase/replacement/018_per_book_returns_checkout.sql` after `017`
before deploying the reader and admin apps. It preserves existing rows and adds
copy-specific return, reader book activity, card-verified checkout, dispute,
charge adjustment, and counter-payment functions. On My Shelf, Finish reading
requires a scan of that copy's barcode and moves only that copy to the return
cart; the seat and timer continue. The standalone `/checkout` kiosk requires no
username/password sign-in. The reader taps the RFID card linked to their active
session; the server silently identifies that reader, requires all copies to
have been returned, stops the timer, and shows that session's summary plus food
and other charges. Apply `supabase/replacement/023_checkout_session_summary.sql`
after `022` before deploying the updated reader kiosk. The summary lists each
borrowed book by title and copy number, along with the seat, reading time, and
charges. The reader reviews it and completes checkout even when nothing is due.
A session with a charge waits for counter payment before closing. A disputed
charge pauses checkout and appears in the admin dashboard's
Checkout counter; staff adjust it there and record payment. The reader then
completes checkout, which releases the seat. Self-payment is not enabled.

Apply `supabase/replacement/020_return_books_by_isbn.sql` after `018` to allow
the Finish reading confirmation to accept either the physical-copy barcode or
the selected title's ISBN. Then apply
`supabase/replacement/022_active_book_limit.sql` after `020`. The latter keeps
the three-book rule based on copies currently `With Reader`, rather than every
book scanned during the lifetime of the seat/timer session. Returning one book
therefore changes the active count from 3 to 2 and immediately frees a slot for
another scan. Both files replace functions only; they add no tables or columns
and do not rewrite existing rows.

## Quest and gamification module (UC-10 through UC-16)

For reader session history balances, apply
`supabase/replacement/036_session_history_balances.sql` after `035`.
It snapshots remaining minutes and unlimited membership at checkout, after the
time debit in the same transaction. Existing completed sessions show “Not
recorded”; their historical balances are not inferred from current balances.
The reader UI still displays sessions and payment status before this migration
is applied, but new balance snapshots require the migration.

Apply `supabase/replacement/019_quest_gamification_existing_schema.sql` after
`018` before deploying the reader and admin apps. It adds no tables and no
columns. It reuses `quests.revised_parameters`, `user_quests`,
`session_activity_logs`, `ai_requests`, `rank_history`, and `redemptions`, adding
only server functions, a verified-activity trigger, and indexes. Existing rows
are preserved. Earned quest rank is calculated from awarded quest points and
kept separate from the paid membership fields.

Quest progress is authoritative in PostgreSQL. Only a verified reading session
followed by return of the same physical copy can advance an objective. The
completion transaction marks the assignment complete, records points once in
the existing assignment and activity audit log, and evaluates rank advancement
in the existing rank history. Readers have read-only
access to their progress and cannot submit progress or points directly.

The reader `/api/quest-cycle` endpoint checks for an active quest before making
an AI request. It uses earned rank, completed quest genres, live in-shelf
inventory, difficulty bounds, and librarian feedback, then assigns the
validated result through a service-role-only database function. Configure
`SUPABASE_SECRET_KEY` only in the reader deployment's server environment; never
expose it as a `VITE_` variable. Both that endpoint and the admin
`/api/quest-suggestion` route require `OPENROUTER_API_KEY` for AI generation
and accept `OPENROUTER_MODEL` and `OPENROUTER_SITE_URL`. Without the key, on
provider failure, or on invalid structured output, the reader receives a
catalog-validated predefined template. Librarian refinements are prompt
guidance, not model retraining. Reward redemption tables and ledger transaction
types are prepared, but the redemption UI and fulfillment workflow remain a
later milestone.

Apply `supabase/replacement/014_catalog_edition_metadata.sql` after `013`
before deploying the improved Add Volume workflow. It adds reviewed metadata
provenance, acquisition dates, checksum validation, duplicate-ISBN reuse, and
atomic creation of a catalog edition plus its uniquely barcoded physical copy.

Apply `supabase/replacement/026_admin_edit_catalog_metadata.sql` to enable the
catalogue pencil action to update book information as well as cover art.

Apply `supabase/replacement/027_prevent_duplicate_quest_definitions.sql` to
reuse the shared fallback quest and reject new duplicate pending/approved quest
definitions without removing historical reader assignments.

Apply `supabase/replacement/028_snack_reward_shop.sql` after `027` before
deploying the reader and admin apps. It adds the reward catalogue fields,
idempotent atomic redemption, staff fulfillment, and a public `reward-images`
bucket with librarian-only writes. The six example products are seeded hidden
with zero stock; staff must upload approved product images, enter real stock,
and enable each item in Admin → Rewards. Reader rank uses lifetime quest points,
while the separately displayed available balance subtracts non-cancelled
redemptions, so spending never lowers rank.

Validation uses an isolated PostgreSQL engine and mocked browser requests:

```powershell
npm install --prefix work/shelf-validation --no-save @electric-sql/pglite playwright
node --experimental-strip-types tests/book-shelf-location.mjs
```

For browser checks, start the reader on port 5174 with
`VITE_SUPABASE_URL=https://demo.supabase.co`,
`VITE_SUPABASE_PUBLISHABLE_KEY=demo-key`, and `VITE_SORA_SCHEMA=sora_v2`, then
run `node tests/book-shelf-location-ui.mjs` (requires Chrome). All database
responses in this browser test are mocked.
