-- Run once on an existing database that does not yet have librarycard.is_active.
-- Fresh installations already include the column in 001_schema.sql.
begin;

alter table sora_v2.librarycard
  add column is_active boolean not null default true;

-- Preserve the inactive status of previously deactivated cards.
update sora_v2.librarycard
set is_active = false
where deactivated_at is not null;

commit;
