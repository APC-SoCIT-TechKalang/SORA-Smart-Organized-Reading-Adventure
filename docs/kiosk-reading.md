# Kiosk seat selection and book scanning (UC-03 / UC-04)

## Apply the database update

For your existing Supabase project, open `supabase/replacement/011_kiosk_reading.sql`,
copy its complete contents into Supabase SQL Editor, and run it **once**.
You already applied the library card `is_active` change; do not rerun `010`.
Do not rerun the initial schema or reset the database. This update expects the
existing `sora_v2` Auth mapping, RLS, reader operations and checkout functions.

The revised migration uses only your existing adviser-reviewed tables and columns.
It adds/replaces SQL functions and a checkout trigger. It does not create tables,
add columns, or change existing table definitions, and does not delete records.
The earlier proposed version that added three tables has been replaced; use the
current file from this repository, not an older copy. This script does not drop
any tables if the earlier version was already applied.

Deploy the reader app update together with this migration:
the old reader `start_reading` RPC permission is removed to prevent bypassing the
check-in, barcode and seat requirements. Any other clients calling that old RPC
must switch to `kiosk_scan_book` too.

## Run the reader app on Windows

From the repository folder (the folder containing `apps` and `supabase`):

```powershell
cd ".\apps\BONBON UI USER"
npm.cmd install
```

Create `.env.local` in that app folder with your own Supabase project settings:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_SORA_SCHEMA=sora_v2
```

Use the publishable key, never a service-role key in these Vite variables.
Ensure `sora_v2` is already an exposed schema in your project's API settings.

```powershell
npm.cmd run dev
```

Open the local URL Vite prints (normally `http://localhost:5173/?reading=1`).
If Vite chooses a different port, use that port. `npm.cmd` avoids PowerShell's
restriction on running `npm.ps1`. Node.js 20.9 or later is required.

## Try the complete flow

1. Sign in with an existing librarian account in the **reader app**, then open
   **My shelf**. This provides a small staff check-in form so these use cases can
   be tested without building the full UC-01 counter screen.
2. Enter/scan the reader's `librarycard_rfid`, click **Look up reader**, physically
   verify the displayed name and username against the person, then click
   **Identity verified — approve check-in**. The reader must have an active card,
   active account and unexpired active membership. This form does not provide
   profile photo verification; the current users schema has no photo field.
3. Sign out. Sign in with that reader account and open **View Seats** or **My shelf**. For testing
   staff and reader accounts simultaneously, use separate browser profiles or
   an incognito window; ordinary tabs share the Supabase sign-in.
4. Select an available seat, focus **Book ISBN or copy barcode**, scan a barcode
   and press Enter (or click **Scan & start session**). A USB scanner operating
   as a keyboard works with this field. Typing a real barcode manually also
   works for testing. The reader needs reading minutes unless their membership
   is Guild Adventurer.
5. Verify the session number, seat, books and elapsed timer appear. In Supabase,
   check that the seat is `OCCUPIED`, the copy is `With Reader`, and `sessions`
   contains the reader, primary copy, seat and timestamps. Each successful scan
   also records `KIOSK_BOOK_SCANNED` in `session_activity_logs` with the existing
   session, user, book and copy foreign keys.
6. Scan a second book: it appears in the same session without resetting the
   timer. Select another available seat and click **Move to selected seat**:
   the original seat becomes available.
7. For an unavailable physical copy, scan its exact copy barcode. The app rejects
   it and records an `INVENTORY_DISCREPANCY` activity log. Librarians can see
   recent alerts in their My shelf panel. The alert is a database/dashboard
   notice, not an email or push notification.
8. When every configured seat is occupied, a reader without a session can
   **Join seat waitlist**. While this page stays open, it shows a notice when a
   seat becomes available. It does not reserve seats or send external messages.
9. The existing **Finish reading** button closes the session, releases the seat,
   returns all linked copies to `In Return Cart`, and records time once.
   This retains the existing simplified checkout; it does not implement the full
   UC-05 payment/dispute workflow.

To find test values, run this read-only query in SQL Editor:

```sql
select b.title, b.isbn, c.barcode, c.copy_status
from sora_v2.books b
join sora_v2.book_copies c on c.book_id = b.book_id
order by b.title, c.copy_number;

select seat_id, seat_number, seat_area, seat_status
from sora_v2.seats order by seat_number;
```

If no seats exist, add your actual lounge seats through Supabase Table Editor
with `seat_status = 'AVAILABLE'`. A seat map cannot be inferred from seat numbers;
the interface groups numbered seat buttons in a grid and displays their area.

## Behavior and design choices

- A seat selection before scanning is provisional. The first successful book
  scan commits the seat assignment and starts the timer atomically. The existing
  schema requires both a copy and a seat when creating a session; this avoids
  inventing an incomplete timed session merely to hold a seat. During a session,
  a confirmed seat change takes effect immediately.
- Seat status refreshes every 3 seconds through polling, including other users'
  changes. No Supabase Realtime publication configuration is required. Database
  locks recheck availability when saving; a stale available button cannot claim
  an occupied seat. This is automatic periodic refresh, not instant push.
- ISBN identifies a title, so an ISBN scan chooses an available copy of that
  title. Use the unique `book_copies.barcode` to identify a particular physical
  copy and detect a discrepancy even when other copies of the title are free.
- A librarian check-in is recorded as `CHECKIN_APPROVED` in the existing
  `session_activity_logs`, including the approving librarian in `details`.
  It is valid for 12 hours and ended by a `CHECKIN_ENDED` event on completed
  checkout. That expiry is an implementation assumption because UC-01 does not
  specify a validity period. The kiosk cannot self-approve check-in.
- Waitlist joins/leaves are `SEAT_WAITLIST_JOINED` / `SEAT_WAITLIST_LEFT` events
  in `session_activity_logs`; their existing `created_at` records arrival time.
  Availability notices are shown to waiting readers with this page open; no
  priority reservation is made.
- `sessions.copy_id` remains the first book. Additional scanned books are linked
  using `session_activity_logs.session_id` and `copy_id`. `kiosk_reading_state`
  reads these events and the primary copy together to list the reader's books;
  checkout releases them all. Preserve these activity records, particularly for
  active sessions, because they supply the additional-book associations.
- Raw activity logs retain the existing staff-only RLS policy. The reader state
  function returns only the signed-in reader's session, books and event status;
  only librarians receive inventory alerts.
- The timer derives from the database start time, so page refresh, kiosk logout,
  changing seats or adding books does not restart the reading session.
- Normal sign-in supports local testing. `/kiosk` still requires the existing
  trusted RFID bridge or compatible NFC setup. This checkout does **not** contain
  `/api/kiosk/rfid-login`; Vite does not provide that server endpoint. This change
  updates the post-authentication destination to the reading screen but does not
  implement or validate physical card authentication or scanner hardware.

## Changed files

- `supabase/replacement/011_kiosk_reading.sql`: functions and a checkout trigger
  for staff check-in, scan validation, seat changes, waitlist, inventory notices
  and multi-book cleanup. No tables, columns or RLS policies are added.
- `apps/BONBON UI USER/src/components/KioskReading.tsx`: numbered seat map,
  scanner form, session timer, books, waitlist notices and staff prerequisite form.
- `src/pages/Shelf.tsx`: displays the new panel for signed-in `sora_v2` accounts.
- `src/pages/VisitorGuide.tsx`: replaces the demo seat preview with the functional
  panel on **View Seats** for `sora_v2` accounts, with a sign-in prompt for guests.
- `src/contexts/GameContext.tsx`: opens My shelf for `?reading=1`; directs catalog
  reading actions to the seat/scan flow.
- `src/KioskApp.tsx`: directs successful card authentication to `/?reading=1`.
- `tests/kiosk-reading.mjs`: PostgreSQL validation using an isolated PGlite database.
- `tests/kiosk-reading-ui.mjs`: browser interaction checks with mocked API responses.

## Verification

TypeScript compilation, the Vite production build and ESLint pass (ESLint has
existing warnings in GameContext). A schema snapshot test verifies that applying
the revised migration leaves all table names, columns, types, defaults and nullability
unchanged. Isolated PostgreSQL checks also cover permissions,
check-in, inactive cards, expired memberships, time balance, age checks, missing
seats, successful scans, occupied seats, unavailable copies, inventory alerts,
multiple books, seat changes, checkout and duplicate waitlist entries.
Browser checks cover the matching interactions and mobile overflow. These checks
do not connect to your live database or prove physical hardware compatibility.

To rerun database tests from the repository root:

```powershell
npm.cmd install --prefix work/kiosk-validation --no-save --package-lock=false @electric-sql/pglite playwright
node tests/kiosk-reading.mjs
```

To rerun UI tests, first start a separate Vite instance with **fake** test settings
(these override `.env.local` only for that terminal process):

```powershell
cd ".\apps\BONBON UI USER"
$env:VITE_SUPABASE_URL='https://demo.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='demo-public-key'
$env:VITE_SORA_SCHEMA='sora_v2'
npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

In another terminal at the repository root, run `node tests/kiosk-reading-ui.mjs`.
The browser checks use installed Google Chrome in headless mode and intercept
all calls to the fake Supabase host. Close the test server afterward; use your
normal terminal/environment for real Supabase testing.
