-- Public catalog availability without exposing individual inventory records.
-- Run after the existing sora_v2 schema and access policy migrations.
create or replace function sora_v2.public_catalog_availability(book_ids integer[])
returns table(book_id integer, available_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select b.book_id,
         count(c.copy_id) filter (where c.copy_status = 'In-Shelf') as available_count
  from sora_v2.books as b
  left join sora_v2.book_copies as c on c.book_id = b.book_id
  where b.book_id = any(book_ids)
  group by b.book_id;
$$;

revoke all on function sora_v2.public_catalog_availability(integer[]) from public;
grant execute on function sora_v2.public_catalog_availability(integer[]) to anon, authenticated;
