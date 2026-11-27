-- Limit readers to three books currently in their possession, not three scans
-- over the lifetime of a reading session. Apply after 020_return_books_by_isbn.sql.
-- Replaces functions only; no tables, columns, or existing rows are changed.
begin;

create or replace function sora_v2.kiosk_scan_book(p_barcode text, p_seat_id integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reader sora_v2.users%rowtype;
  active sora_v2.sessions%rowtype;
  chosen sora_v2.book_copies%rowtype;
  chosen_book sora_v2.books%rowtype;
  chosen_seat sora_v2.seats%rowtype;
  hold jsonb;
  scan text := btrim(p_barcode);
  active_book_count integer := 0;
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

  -- Both scans and returns lock this row, so the active-copy count remains race-safe.
  select * into active from sora_v2.sessions
    where user_id = reader.id and session_status <> 'CLOSED' for update;
  if active.session_status = 'CHECKOUT PENDING' then
    raise exception 'Complete checkout before scanning another book'; end if;
  if active.session_id is not null then
    select count(*) into active_book_count
    from sora_v2.book_copies c
    where c.copy_status = 'With Reader'
      and (c.copy_id = active.copy_id or exists(
        select 1 from sora_v2.session_activity_logs l
        where l.session_id = active.session_id
          and l.copy_id = c.copy_id
          and l.action = 'KIOSK_BOOK_SCANNED'));
    if active_book_count >= 3 then
      raise exception 'You can have a maximum of three books at one time. Return one before scanning another book.';
    end if;
  end if;

  -- Exact copy barcodes take priority. ISBN scans allocate an available copy.
  select * into chosen from sora_v2.book_copies where barcode = scan for update;
  if chosen.copy_id is null then
    select * into chosen_book from sora_v2.books
      where regexp_replace(isbn, '[^0-9Xx]', '', 'g') = regexp_replace(scan, '[^0-9Xx]', '', 'g')
      and regexp_replace(scan, '[^0-9Xx]', '', 'g') <> '' order by book_id limit 1;
    if chosen_book.book_id is null then raise exception 'Book not found. Ask library staff for help'; end if;
    select * into chosen from sora_v2.book_copies
      where book_id = chosen_book.book_id and copy_status = 'In-Shelf'
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
    perform sora_v2.kiosk_expire_seat_holds();
    hold := sora_v2.kiosk_seat_hold(reader.id);
    if hold is null or p_seat_id is distinct from (hold->>'seat_id')::integer then
      raise exception 'Choose and confirm an available seat before scanning'; end if;
    select * into chosen_seat from sora_v2.seats where seat_id = p_seat_id for update;
    if sora_v2.kiosk_seat_hold(reader.id) is null then
      raise exception 'Your seat hold expired. Choose and confirm a seat again'; end if;
    if chosen_seat.seat_id is null or chosen_seat.seat_status <> 'OCCUPIED'
      or exists(select 1 from sora_v2.sessions where seat_id = p_seat_id and session_status <> 'CLOSED') then
      raise exception 'That seat is no longer available. Choose another seat'; end if;
    insert into sora_v2.sessions(user_id, copy_id, seat_id, checked_in_at)
      values(reader.id, chosen.copy_id, p_seat_id, sora_v2.kiosk_checkin_time(reader.id))
      returning * into active;
    insert into sora_v2.session_activity_logs(session_id,user_id,action,details)
      values(active.session_id,reader.id,'KIOSK_SEAT_CONSUMED',jsonb_build_object('seat_id',p_seat_id)::text);
    insert into sora_v2.session_activity_logs(session_id, user_id, action)
      values(active.session_id, reader.id, 'SEAT_WAITLIST_LEFT');
  end if;

  update sora_v2.book_copies set copy_status = 'With Reader' where copy_id = chosen.copy_id;
  insert into sora_v2.session_activity_logs(session_id, user_id, book_id, copy_id, action)
    values(active.session_id, reader.id, chosen.book_id, chosen.copy_id, 'KIOSK_BOOK_SCANNED');
  return jsonb_build_object('session_id', active.session_id, 'title', chosen_book.title,
    'book_count', active_book_count + 1, 'book_limit', 3);
end;
$$;

create or replace function sora_v2.kiosk_reading_state()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  reader_id uuid := sora_v2.current_user_id();
  active sora_v2.sessions%rowtype;
  reader_role text;
  result jsonb;
  hold jsonb;
begin
  select user_role into reader_role from sora_v2.users where id = reader_id and is_active;
  if reader_role is null then raise exception 'Active account required'; end if;
  perform sora_v2.kiosk_expire_seat_holds();
  hold := sora_v2.kiosk_seat_hold(reader_id);
  select * into active from sora_v2.sessions where user_id = reader_id and session_status <> 'CLOSED';
  select jsonb_build_object(
    'seats', coalesce((select jsonb_agg(s order by seat_number, seat_id) from sora_v2.seats s), '[]'::jsonb),
    'active', case when active.session_id is null then null else to_jsonb(active) end,
    'checked_in', sora_v2.kiosk_checkin_time(reader_id) is not null,
    'waiting', coalesce((select action = 'SEAT_WAITLIST_JOINED' from sora_v2.session_activity_logs
      where user_id = reader_id and action in ('SEAT_WAITLIST_JOINED','SEAT_WAITLIST_LEFT') order by log_id desc limit 1), false),
    'staff', reader_role = 'Librarian',
    'reservation', hold,
    -- Only copies still held by this reader consume one of the three slots.
    'books', coalesce((select jsonb_agg(jsonb_build_object('copy_id', c.copy_id,
      'book_copies', jsonb_build_object('barcode', c.barcode, 'books', jsonb_build_object('title', b.title))) order by c.copy_id)
      from sora_v2.book_copies c join sora_v2.books b on b.book_id = c.book_id
      where active.session_id is not null
        and c.copy_status = 'With Reader'
        and (c.copy_id = active.copy_id or exists(
          select 1 from sora_v2.session_activity_logs l where l.session_id = active.session_id
          and l.copy_id = c.copy_id and l.action = 'KIOSK_BOOK_SCANNED'))), '[]'::jsonb),
    'alerts', case when reader_role = 'Librarian' then coalesce((select jsonb_agg(a) from (
      select log_id, details, created_at from sora_v2.session_activity_logs
      where action = 'INVENTORY_DISCREPANCY' order by log_id desc limit 10) a), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

revoke all on function sora_v2.kiosk_scan_book(text,integer), sora_v2.kiosk_reading_state()
  from public,anon,authenticated;
grant execute on function sora_v2.kiosk_scan_book(text,integer), sora_v2.kiosk_reading_state()
  to authenticated;

commit;
