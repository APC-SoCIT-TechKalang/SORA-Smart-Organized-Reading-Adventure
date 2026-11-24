# Return books using their original ISBN

Apply the complete `supabase/replacement/020_return_books_by_isbn.sql` file in
Supabase SQL Editor after the existing per-book return migration (`018`).
If gamification (`019`) is installed, leave it in place. Then deploy the reader
UI update. A frontend deployment alone cannot change the database validation.
This update replaces only `kiosk_return_book`; it adds no tables or columns and
does not change existing ISBNs, inventory barcodes, or historical returns.

The return prompt accepts the selected copy's `book_copies.barcode` or its
original `books.isbn`. ISBN-10/ISBN-13 values can include spaces and hyphens;
an ISBN-10 X is case-insensitive. Exact inventory barcodes remain exact matches.
An inventory barcode assigned to another copy is rejected.

An ISBN identifies the title/edition, so when several copies share an ISBN, the
copy selected in My Shelf is the one returned. Only a copy recorded in the
signed-in reader's active session can be returned. Older sessions without scan
events can return their recorded primary copy. Returns leave the seat and timer
running and preserve existing gamification return events.

Isolated PostgreSQL checks (no connection to Supabase):

```powershell
npm.cmd install --prefix work/quest-validation --no-save --package-lock=false @electric-sql/pglite
node tests/return-books-by-isbn.mjs
```
