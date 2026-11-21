# Kiosk seat selection and book scanning (UC-03 / UC-04)

## Library floor plan and confirmed seats

After `011`, run the complete `supabase/replacement/012_library_seat_layout.sql`
in Supabase SQL Editor. If `011` is already installed, run only `012` for this
update. Do not rerun `011` afterward: its older scan/state routines do not include
confirmed seat holds. Deploy the reader app update together with `012`.

The floor plan follows the reference library's arrangement: reception and desk
seats on the left, shared center seating, L pods on the right/bottom, and a separate
quiet wing with U pods. It is a schematic seating selector, not an architectural
plan. The approved initial capacity is:

| Area (`seat_area`) | Seat numbers | Count |
| --- | --- | --- |
| Desk Area | 1–4 | 4 |
| Center Seating | 5–10 | 6 |
| L Pods A | 11–12 | 2 |
| L Pods B | 13–15 | 3 |
| U Pods A | 16–17 | 2 |
| U Pods B | 18–20 | 3 |

`012` inserts these 20 records into the **existing** `seats` table only if that
table is empty. It never adds tables/columns, deletes records or resets an
existing seat's occupancy. If you already configured seats, their records are
preserved: match `seat_area` to the names above in Table Editor to position them
on the map. Unrecognized areas appear as other configured seating below the map.

Seat colors and icons distinguish available, selected, your seat and unavailable.
Selecting a seat highlights it locally. Clicking **Confirm seat** claims it in
Supabase immediately, so other readers see it unavailable on their next refresh
(at most about 3 seconds). A confirmed seat is held for 5 minutes while the reader
scans a book; the reading timer starts only on a successful book scan. Holds can
be released or switched, survive page refresh, and expire automatically when a
reader next loads/polls the map. Active reading sessions never expire through
this hold mechanism. The map scrolls horizontally on narrow screens and keeps
seat buttons large enough to tap.

Hold ownership is stored in existing `session_activity_logs` events:
`KIOSK_SEAT_RESERVED`, `KIOSK_SEAT_RELEASED`, `KIOSK_SEAT_CONSUMED`. Their `details`
contain the seat ID, and the existing `created_at` supplies the five-minute expiry.
Reserved seats use the existing `OCCUPIED` status. SQL functions lock and recheck
the seat to reject conflicting claims; readers cannot cancel someone else's hold.

Restart the reader Vite server and refresh the browser after applying `012`.
Librarian check-in approval remains in **Admin dashboard → Readers → Reader check-in**.

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
cd ".\apps\bonbon-ui-user"
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

If a valid available ISBN does not start reading, check **Reading time** beside
the scanner. An active Guild Member membership can still have **0 minutes**.
In the admin dashboard, open **Top-up terminal**, select that reader, enter the
minutes to add, amount paid, payment method and receipt/reference, and click
**Confirm top-up**. For a test, 60 minutes is enough; record it as a test transaction
with accurate payment details. The reader page detects the updated balance within
about 3 seconds. Guild Adventurer accounts do not require a minute balance.
Scan errors and success messages appear beside the scanner; errors scroll into
view. This balance/feedback UI update does not require additional SQL.

1. Keep the reader app running (normally port 5173). In another terminal, start
   the librarian app from `apps/admin-dashboard` with `npm.cmd run dev`
   (normally port 3000). Sign in with the librarian account **only in the admin
   dashboard**, then open **Readers → Reader check-in**.
2. Enter/scan the reader's `librarycard_rfid`, click **Look up reader**, physically
   verify the displayed name, username and birthdate against the person, tick
   **I verified this reader's identity**, then click **Approve check-in**.
   The reader must have an active card,
   active account and unexpired active membership. This form does not provide
   profile photo verification; the current users schema has no photo field.
3. The reader signs into the **reader app** with their own reader account and
   opens **View Seats** or **My shelf**. Keep the librarian signed into the admin
   dashboard. Their sessions are separate on the two localhost origins/ports.
   The reader page automatically detects approval within 3 seconds, so the
   reader does not need to sign out or sign in as staff.
4. Select an available seat and click **Confirm seat**. Focus **Book ISBN or copy barcode**, scan a barcode
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
   recent alerts under **Readers → Reader check-in** in the admin dashboard. The alert is a database/dashboard
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

- A highlighted seat is provisional until **Confirm seat** is clicked. Confirmation
  holds the seat immediately without creating an incomplete timed session.
  The first successful book scan consumes that hold and creates the session.
  During a session, a confirmed seat change takes effect immediately.
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
- Check-in approval and inventory alert controls exist only in the admin
  dashboard. Librarian credentials are rejected by reader sign-in and kiosk
  authentication, and existing librarian sessions in the reader app are cleared.
  The existing SQL function still enforces librarian authorization on approval.
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
- `supabase/replacement/012_library_seat_layout.sql`: initial 20 seat records
  when empty, exclusive five-minute holds, release/expiry and scan conversion.
- `apps/bonbon-ui-user/src/components/LibrarySeatMap.tsx` and `library-seat-map.css`:
  library floor plan, interactive seat icons, status legend and mobile map scrolling.
- `apps/bonbon-ui-user/src/components/KioskReading.tsx`: numbered seat map,
  scanner form, session timer, books, waitlist notices and approval status.
- `apps/admin-dashboard/components/admin/ReaderCheckIn.tsx`: card lookup,
  identity verification, check-in approval and recent inventory alerts under Readers.
- `src/pages/Shelf.tsx`: displays the new panel for signed-in `sora_v2` accounts.
- `src/pages/VisitorGuide.tsx`: replaces the demo seat preview with the functional
  panel on **View Seats** for `sora_v2` accounts, with a sign-in prompt for guests.
- `src/contexts/GameContext.tsx`: opens My shelf for `?reading=1`; directs catalog
  reading actions to the seat/scan flow and rejects librarian sessions in the reader app.
- `src/KioskApp.tsx`: directs successful card authentication to `/?reading=1`.
- `tests/kiosk-reading.mjs`: PostgreSQL validation using an isolated PGlite database.
- `tests/kiosk-reading-ui.mjs`: browser interaction checks with mocked API responses.
- `tests/admin-checkin-ui.mjs`: checks admin-only approval and automatic updates
  to the reader screen using isolated browser contexts and mocked Supabase calls.
- `tests/library-seat-map-ui.mjs`: verifies all 20 seat positions, occupied seats,
  two-reader availability, hold restoration/release/expiry, scanning and mobile layout.

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
cd ".\apps\bonbon-ui-user"
$env:VITE_SUPABASE_URL='https://demo.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='demo-public-key'
$env:VITE_SORA_SCHEMA='sora_v2'
npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

In another terminal at the repository root, run `node tests/kiosk-reading-ui.mjs`.
The browser checks use installed Google Chrome in headless mode and intercept
all calls to the fake Supabase host. Close the test server afterward; use your
normal terminal/environment for real Supabase testing.

With the admin app also running on port 3000, run `node tests/admin-checkin-ui.mjs`
to verify the two-app check-in flow. This test uses the configured admin project
URL only to intercept requests, and replaces all Supabase responses; it does not
create real check-ins. It requires the admin `.env.local` URL and uses a separate,
temporary browser session. There is no need to rerun `011` when moving the form
from the reader app to the admin app.
