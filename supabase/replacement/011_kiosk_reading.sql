-- UC-03 and UC-04 using ONLY the existing adviser-reviewed tables and columns.
-- Requires librarycard.is_active and the existing 002/003 reader functions.
-- This file adds/replaces routines and a trigger, never tables or columns.
begin;

-- Check-in is an activity event; checkout records a matching end event.
create or replace function sora_v2.kiosk_checkin_time(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when action = 'CHECKIN_APPROVED' and created_at > now() - interval '12 hours'
    then created_at else null end
  from sora_v2.session_activity_logs
  where user_id = p_user_id and action in ('CHECKIN_APPROVED', 'CHECKIN_ENDED')
  order by log_id desc limit 1;
$$;

create or replace function sora_v2.approve_kiosk_checkin(p_rfid text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare reader_id uuid;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian approval required'; end if;
  select u.id into reader_id from sora_v2.librarycard c join sora_v2.users u on u.id = c.user_id
  where c.librarycard_rfid = btrim(p_rfid) and c.is_active and c.deactivated_at is null
    and u.is_active and u.user_role = 'Reader' and u.membership_status = 'ACTIVE'
    and u.membership_expires_at > now() for update of u, c;
  if reader_id is null then raise exception 'Active card and membership required'; end if;
  insert into sora_v2.session_activity_logs(user_id, action, details)
    values(reader_id, 'CHECKIN_APPROVED', 'Identity verified by librarian ' || sora_v2.current_user_id());
  return reader_id;
end;
$$;

create or replace function sora_v2.kiosk_scan_book(p_barcode text, p_seat_id integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reader sora_v2.users%rowtype;
  active sora_v2.sessions%rowtype;
  chosen sora_v2.book_copies%rowtype;
  chosen_book sora_v2.books%rowtype;
  chosen_seat sora_v2.seats%rowtype;
  scan text := btrim(p_barcode);
begin
  select * into reader from sora_v2.users where id = sora_v2.current_user_id() for update;
  if reader.id is null or not reader.is_active or reader.user_role <> 'Reader' then
    raise exception 'Active reader account required'; end if;
  if reader.membership_status <> 'ACTIVE' or reader.membership_expires_at is null
    or reader.membership_expires_at <= now() then raise exception 'Active membership required'; end if;
  if reader.membership_type <> 'Guild Adventurer' and reader.remaining_minutes <= 0 then
    raise exception 'Ask staff to add reading time'; end if;
  if not exists (select 1 from sora_v2.librarycard where user_id = reader.id
    and is_active and deactivated_at is null) then raise exception 'Active library card required'; end if;
  if sora_v2.kiosk_checkin_time(reader.id) is null then
    raise exception 'Ask a librarian to approve your check-in first'; end if;
  if scan is null or scan = '' or length(scan) > 100 then raise exception 'Scan a valid barcode'; end if;
  select * into active from sora_v2.sessions where user_id = reader.id and session_status <> 'CLOSED' for update;
  if active.session_status = 'CHECKOUT PENDING' then raise exception 'Complete checkout before scanning another book'; end if;

  -- Exact copy barcodes take priority. ISBN scans allocate an available copy of that title.
  select * into chosen from sora_v2.book_copies where barcode = scan for update;
  if chosen.copy_id is null then
    select * into chosen_book from sora_v2.books
      where regexp_replace(isbn, '[^0-9Xx]', '', 'g') = regexp_replace(scan, '[^0-9Xx]', '', 'g')
      and regexp_replace(scan, '[^0-9Xx]', '', 'g') <> '' order by book_id limit 1;
    if chosen_book.book_id is null then raise exception 'Book not found. Ask library staff for help'; end if;
    select * into chosen from sora_v2.book_copies where book_id = chosen_book.book_id and copy_status = 'In-Shelf'
      order by copy_id limit 1 for update skip locked;
  else
    select * into chosen_book from sora_v2.books where book_id = chosen.book_id;
  end if;
  if chosen.copy_id is null or chosen.copy_status <> 'In-Shelf' then
    insert into sora_v2.session_activity_logs(user_id, book_id, copy_id, action, details)
      values(reader.id, chosen_book.book_id, chosen.copy_id, 'INVENTORY_DISCREPANCY',
        'Rejected kiosk scan: ' || scan || '. Set the book aside and ask staff for help.');
    return jsonb_build_object('error', 'Book is unavailable. Set it aside and ask staff for assistance. Staff have been alerted.');
  end if;
  if extract(year from age(current_date, reader.birthdate)) < chosen_book.age_rating then
    raise exception 'This book is restricted for your age group'; end if;

  if active.session_id is null then
    if p_seat_id is null then raise exception 'Choose an available seat before scanning'; end if;
    select * into chosen_seat from sora_v2.seats where seat_id = p_seat_id for update;
    if chosen_seat.seat_id is null or chosen_seat.seat_status <> 'AVAILABLE'
      or exists(select 1 from sora_v2.sessions where seat_id = p_seat_id and session_status <> 'CLOSED') then
      raise exception 'That seat is no longer available. Choose another seat'; end if;
    insert into sora_v2.sessions(user_id, copy_id, seat_id, checked_in_at)
      values(reader.id, chosen.copy_id, p_seat_id,
        sora_v2.kiosk_checkin_time(reader.id))
      returning * into active;
    update sora_v2.seats set seat_status = 'OCCUPIED' where seat_id = p_seat_id;
    insert into sora_v2.session_activity_logs(session_id, user_id, action)
      values(active.session_id, reader.id, 'SEAT_WAITLIST_LEFT');
  end if;
  update sora_v2.book_copies set copy_status = 'With Reader' where copy_id = chosen.copy_id;
  insert into sora_v2.session_activity_logs(session_id, user_id, book_id, copy_id, action)
    values(active.session_id, reader.id, chosen.book_id, chosen.copy_id, 'KIOSK_BOOK_SCANNED');
  return jsonb_build_object('session_id', active.session_id, 'title', chosen_book.title);
end;
$$;

create or replace function sora_v2.kiosk_change_seat(p_seat_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype; chosen sora_v2.seats%rowtype;
begin
  perform 1 from sora_v2.users where id = sora_v2.current_user_id() and is_active for update;
  if not found then raise exception 'Active reader required'; end if;
  select * into active from sora_v2.sessions where user_id = sora_v2.current_user_id()
    and session_status = 'READING' for update;
  if active.session_id is null then raise exception 'Start a session first'; end if;
  if active.seat_id = p_seat_id then return; end if;
  -- Consistent lock order prevents two readers swapping seats from deadlocking.
  perform 1 from sora_v2.seats where seat_id in (active.seat_id, p_seat_id) order by seat_id for update;
  select * into chosen from sora_v2.seats where seat_id = p_seat_id;
  if chosen.seat_id is null or chosen.seat_status <> 'AVAILABLE'
    or exists(select 1 from sora_v2.sessions where seat_id = p_seat_id and session_status <> 'CLOSED') then
    raise exception 'That seat is no longer available'; end if;
  update sora_v2.seats set seat_status = 'AVAILABLE' where seat_id = active.seat_id;
  update sora_v2.seats set seat_status = 'OCCUPIED' where seat_id = p_seat_id;
  update sora_v2.sessions set seat_id = p_seat_id where session_id = active.session_id;
  insert into sora_v2.session_activity_logs(session_id, user_id, action, details)
    values(active.session_id, active.user_id, 'SEAT_CHANGED', 'Seat ' || active.seat_id || ' to ' || p_seat_id);
end;
$$;

create or replace function sora_v2.kiosk_join_waitlist()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from sora_v2.users where id = sora_v2.current_user_id() and is_active for update;
  if not found then raise exception 'Active reader required'; end if;
  if exists(select 1 from sora_v2.sessions where user_id = sora_v2.current_user_id() and session_status <> 'CLOSED') then
    raise exception 'You already have a seat'; end if;
  if exists(select 1 from sora_v2.seats where seat_status = 'AVAILABLE') then raise exception 'A seat is available. Refresh the map'; end if;
  if (select action from sora_v2.session_activity_logs where user_id = sora_v2.current_user_id()
    and action in ('SEAT_WAITLIST_JOINED','SEAT_WAITLIST_LEFT') order by log_id desc limit 1)
    is distinct from 'SEAT_WAITLIST_JOINED' then
    insert into sora_v2.session_activity_logs(user_id, action)
      values(sora_v2.current_user_id(), 'SEAT_WAITLIST_JOINED');
  end if;
end;
$$;

-- Existing checkout releases every additional book too, without billing time twice.
create or replace function sora_v2.release_session_books()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.session_status = 'CLOSED' and old.session_status <> 'CLOSED' then
    update sora_v2.book_copies set copy_status = 'In Return Cart'
      where copy_id = new.copy_id or copy_id in (
        select copy_id from sora_v2.session_activity_logs
        where session_id = new.session_id and action = 'KIOSK_BOOK_SCANNED');
    insert into sora_v2.session_activity_logs(session_id, user_id, action)
      values(new.session_id, new.user_id, 'CHECKIN_ENDED');
  end if;
  return new;
end;
$$;
drop trigger if exists release_additional_books on sora_v2.sessions;
create trigger release_additional_books after update of session_status on sora_v2.sessions
for each row execute function sora_v2.release_session_books();

-- Readers receive only their own activity-derived state. Raw logs remain staff-only.
create or replace function sora_v2.kiosk_reading_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare reader_id uuid := sora_v2.current_user_id(); active sora_v2.sessions%rowtype;
  reader_role text; result jsonb;
begin
  select user_role into reader_role from sora_v2.users where id = reader_id and is_active;
  if reader_role is null then raise exception 'Active account required'; end if;
  select * into active from sora_v2.sessions where user_id = reader_id and session_status <> 'CLOSED';
  select jsonb_build_object(
    'seats', coalesce((select jsonb_agg(s order by seat_number, seat_id) from sora_v2.seats s), '[]'::jsonb),
    'active', case when active.session_id is null then null else to_jsonb(active) end,
    'checked_in', sora_v2.kiosk_checkin_time(reader_id) is not null,
    'waiting', coalesce((select action = 'SEAT_WAITLIST_JOINED' from sora_v2.session_activity_logs
      where user_id = reader_id and action in ('SEAT_WAITLIST_JOINED','SEAT_WAITLIST_LEFT') order by log_id desc limit 1), false),
    'staff', reader_role = 'Librarian',
    'books', coalesce((select jsonb_agg(jsonb_build_object('copy_id', c.copy_id,
      'book_copies', jsonb_build_object('barcode', c.barcode, 'books', jsonb_build_object('title', b.title))) order by c.copy_id)
      from sora_v2.book_copies c join sora_v2.books b on b.book_id = c.book_id
      where active.session_id is not null and (c.copy_id = active.copy_id or exists(
        select 1 from sora_v2.session_activity_logs l where l.session_id = active.session_id
        and l.copy_id = c.copy_id and l.action = 'KIOSK_BOOK_SCANNED'))), '[]'::jsonb),
    'alerts', case when reader_role = 'Librarian' then coalesce((select jsonb_agg(a) from (
      select log_id, details, created_at from sora_v2.session_activity_logs
      where action = 'INVENTORY_DISCREPANCY' order by log_id desc limit 10) a), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

revoke all on function sora_v2.approve_kiosk_checkin(text), sora_v2.kiosk_scan_book(text,integer),
  sora_v2.kiosk_change_seat(integer), sora_v2.kiosk_join_waitlist(), sora_v2.release_session_books(),
  sora_v2.kiosk_checkin_time(uuid), sora_v2.kiosk_reading_state() from public, anon, authenticated;
grant execute on function sora_v2.approve_kiosk_checkin(text), sora_v2.kiosk_scan_book(text,integer),
  sora_v2.kiosk_change_seat(integer), sora_v2.kiosk_join_waitlist(), sora_v2.kiosk_reading_state() to authenticated;
-- Readers must use the validated scan flow, rather than the old catalog shortcut.
revoke execute on function sora_v2.start_reading(integer,uuid,integer) from authenticated;
commit;
