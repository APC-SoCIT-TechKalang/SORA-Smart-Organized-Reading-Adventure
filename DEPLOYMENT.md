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

Apply `supabase/replacement/014_catalog_edition_metadata.sql` after `013`
before deploying the improved Add Volume workflow. It adds reviewed metadata
provenance, acquisition dates, checksum validation, duplicate-ISBN reuse, and
atomic creation of a catalog edition plus its uniquely barcoded physical copy.

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
