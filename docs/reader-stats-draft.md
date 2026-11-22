# Personal reading stats — draft

Run `npm ci` then `npm run dev` from `apps/bonbon-ui-user` and open
`http://localhost:5173/draft/reading-stats` (use the port Vite prints).
This draft route is reachable in development and production through
**Account menu → View reading stats**. It does not mount the reader data
provider. All metrics remain zero until verified reader history is connected.
The page explains that these zeros are draft placeholders, rather than a
statement about the reader's actual history.

The 30-day, 90-day, and all-time filters all show zero in the draft. Fictional
sessions, books, and preview controls have been removed.

Metrics include completed sessions, recorded minutes, distinct titles,
active reading days, average session duration, genre mix, recent sessions,
and a 14-day activity chart with an accessible daily breakdown.
Calendar boundaries use Asia/Manila. A session belongs to the day it ended;
the selected period includes today. Active sessions do not add completed time.
Genres count each unique catalog title once, not once per visit.
Books finished, pages, percentage progress, and streaks are intentionally absent
because completion and page tracking are not currently recorded reliably.

## Before enabling for readers

- Connect the view to authenticated reader data and handle account changes.
- Verify ownership filtering and database row-level security with two reader
  accounts (including the replacement schema's linked user IDs).
- Confirm duration rules for checkout-pending sessions and test a real kiosk
  start, extra book scan, finish, and return. The existing replacement loader
  maps only the primary book of each session; all scanned titles need a verified
  mapping before reporting a live title or genre total.
- Check empty history, failed loads, background refreshes, and both supported
  database schemas. Never substitute sample data when a real account fails.
- Add the entry to My shelf only after these checks pass.

Run the metric checks with Node 24:
`node apps/bonbon-ui-user/tests/reading-stats.test.mjs`.
