-- Track the current return-cart cycle on the physical copy. Apply after 028
-- on fresh installations. Safe to rerun if this SQL was already applied as 026.
begin;

alter table sora_v2.book_copies
  add column if not exists returned_to_cart_at timestamptz;

create index if not exists session_activity_copy_return_idx
  on sora_v2.session_activity_logs (copy_id, action, created_at desc)
  where action in ('KIOSK_BOOK_RETURNED', 'COPY_LOCATION_UPDATED');

create index if not exists sessions_copy_return_idx
  on sora_v2.sessions (copy_id, return_date desc)
  where return_date is not null;

-- Existing pending copies use a recorded book-return event where possible.
-- A previous shelving event prevents an older return from being mistaken for
-- the current cart entry. Legacy single-copy sessions use return_date.
update sora_v2.book_copies c
set returned_to_cart_at = coalesce(
  (select max(l.created_at)
   from sora_v2.session_activity_logs l
   where l.copy_id = c.copy_id and l.action = 'KIOSK_BOOK_RETURNED'
     and l.created_at > coalesce((
       select max(shelved.created_at)
       from sora_v2.session_activity_logs shelved
       where shelved.copy_id = c.copy_id
         and shelved.action = 'COPY_LOCATION_UPDATED'
         and shelved.details like '%"status": "In-Shelf"%'
     ), '-infinity'::timestamptz)),
  (select max(s.return_date)
   from sora_v2.sessions s
   where s.copy_id = c.copy_id and s.return_date is not null
     and s.return_date > coalesce((
       select max(shelved.created_at)
       from sora_v2.session_activity_logs shelved
       where shelved.copy_id = c.copy_id
         and shelved.action = 'COPY_LOCATION_UPDATED'
         and shelved.details like '%"status": "In-Shelf"%'
     ), '-infinity'::timestamptz))
)
where c.copy_status = 'In Return Cart' and c.returned_to_cart_at is null;

create or replace function sora_v2.stamp_return_cart_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.copy_status = 'In Return Cart' then new.returned_to_cart_at := now(); end if;
    return new;
  end if;
  if new.copy_status = 'In Return Cart'
     and old.copy_status is distinct from new.copy_status then
    new.returned_to_cart_at := now();
  elsif tg_op = 'UPDATE' and old.copy_status = 'In Return Cart'
     and new.copy_status <> 'In Return Cart' then
    new.returned_to_cart_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_return_cart_entry on sora_v2.book_copies;
create trigger stamp_return_cart_entry
before insert or update on sora_v2.book_copies
for each row execute function sora_v2.stamp_return_cart_entry();

create index if not exists book_copies_pending_return_time_idx
  on sora_v2.book_copies (returned_to_cart_at desc)
  where copy_status = 'In Return Cart';

commit;
