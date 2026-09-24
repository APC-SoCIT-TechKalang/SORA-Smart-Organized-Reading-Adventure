# Production deployment

## Architecture

The reader site and staff dashboard are separate deployments. Supabase is the
backend: it provides PostgreSQL, authentication, storage, row-level security
(RLS), and RPC functions. The admin dashboard also has one same-origin Next.js
route, `/api/catalog/lookup`, which calls public book metadata providers.

| Component | Directory | Deploy type | Build command |
| --- | --- | --- | --- |
| Reader site | `apps/BONBON UI USER` | Static Vite site | `npm ci && npm run build` |
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
| Reader site | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Admin dashboard | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Admin dashboard, optional | `GOOGLE_BOOKS_API_KEY` |

Use the matching `.env.example` only for local development. `VITE_*` and
`NEXT_PUBLIC_*` values are embedded in browser code at build time, so rebuilding
is required after changing them.

## Supabase configuration

1. Apply `supabase/migrations/001_initial_schema.sql` through
   `006_isbn_cataloging.sql` to a staging project, then production.
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
