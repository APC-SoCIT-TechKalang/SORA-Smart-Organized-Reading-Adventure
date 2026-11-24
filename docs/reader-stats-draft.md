# Personal reading stats

Run `npm ci` then `npm run dev` from `apps/bonbon-ui-user` and open
`http://localhost:5173/draft/reading-stats` (use the port Vite prints).
The journal is available through **Account menu → My profile → Open full stats**
for activated readers. The original URL is retained. The profile, journal,
standalone route, and home-page stats strip share the history in `GameProvider`.

The 30-day, 90-day, and all-time filters use recorded book returns. For
`sora_v2`, the source is `reader_book_activity()` from the existing
`018_per_book_returns_checkout.sql` migration, scoped to `current_user_id()`.
The legacy schema uses reader `reading_logs`. No new migration is needed when
My Shelf history already works. Loading and query failures have separate states
and a retry action; failures are not presented as zero history.

Access requires an active reader account and an active, unexpired membership.
While activation is unknown or cannot be verified, neither the stats nor the
digital card is shown. Membership is checked on entry, every 30 seconds while
visible, and when returning to the tab. Expiry also revokes access locally.
The archive's reading stats strip uses the same access check.

Metrics include returned books, recorded minutes, distinct titles,
active reading days, average session duration, genre mix, recent sessions,
and a 14-day activity chart with an accessible daily breakdown.
Calendar boundaries use Asia/Manila. A book belongs to its return period;
the selected period includes today. Unreturned books do not add completed time.
Several book records can belong to one visit, so the count is labeled
**Books returned**. Overlapping recorded book intervals within the same visit
count once toward reading time. Legacy records without a shared session ID
remain independent. The per-book average uses individual book durations.
The daily chart splits recorded intervals at Philippine midnight. Historical
records contribute their full duration to their return period; the chart shows
only time within its displayed 14 calendar days.
Genres count each unique catalog title once, not once per visit.
Books finished, pages, percentage progress, and streaks are intentionally absent
because completion and page tracking are not currently recorded reliably.

## Refresh and access

The existing account-change reset, background polling, visibility refresh, and
refresh after returns update the shared history and all stats views together.
Activation checks remain in place. No sample data or inferred page progress is
used, and the returned-book count does not establish that a whole book was read.

Run the metric checks with Node 24:
`node apps/bonbon-ui-user/tests/reading-stats.test.mjs`.
