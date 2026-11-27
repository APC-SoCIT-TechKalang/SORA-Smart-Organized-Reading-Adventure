# Catalog title standardization

Lookup now formats verified English series and single-volume metadata as `Series, Volume N` using a shared pure utility. It retains separate series and volume fields. No translation guesses or default volume numbers are introduced. Special editions retain their distinguishing titles. Covers from series-only manga services are no longer substituted for missing ISBN-edition covers.

Apply `supabase/replacement/029_catalog_title_standardization.sql` after the current migrations. It creates functions and a trigger, no tables. Future recognizable provider-title variants are normalized at the database boundary, including manual and bulk registrations. Custom titles remain unchanged. No existing records change merely by applying the migration.

Preview existing candidates while authenticated as a librarian:

```sql
select * from sora_v2.admin_preview_catalog_titles();
```

Review each proposed title against the physical edition. Apply only selected, verified rows, in batches of at most 100, passing the exact `book_id`, `current_title`, and `proposed_title` from the preview as a JSON array to `sora_v2.admin_apply_catalog_titles(p_approved)`. The function skips records edited since the preview. Keep the preview export as a record of previous titles. ISBNs, IDs, copies, sessions and shelving relationships are not changed. Stored title updates then appear through existing catalog reads across Admin, Reader and Kiosk.

Unresolved English identities, missing/conflicting volumes, special editions and existing records without series metadata need librarian review. The migration does not fetch providers or infer missing English aliases. Image byte validation verifies that a cover is usable, but cannot prove visual edition identity; librarians should check the printed edition when provider covers are wrong.
