-- Librarian-only visit inspection and confirmed checkout for the unified reader station.
-- Apply after 023_realtime_library_card_sync.sql and 023_checkout_session_summary.sql.
begin;

create or replace function sora_v2.admin_reader_station_inspect(p_rfid text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare reader sora_v2.users%rowtype; active sora_v2.sessions%rowtype;
  card_uid text := sora_v2.normalize_rfid_uid(p_rfid);
  pending_books integer := 0; disputed boolean := false;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(card_uid, '') is null then raise exception 'Scan a library card'; end if;
  select u.* into reader from sora_v2.librarycard c join sora_v2.users u on u.id = c.user_id
    where sora_v2.normalize_rfid_uid(c.librarycard_rfid) = card_uid
      and c.is_active and c.deactivated_at is null limit 1;
  if reader.id is null or reader.user_role <> 'Reader' then raise exception 'No active reader card found'; end if;

  select * into active from sora_v2.sessions
    where user_id = reader.id and session_status <> 'CLOSED'
    order by session_id desc limit 1;
  if active.session_id is not null then
    select count(*) into pending_books from sora_v2.book_copies c
      where c.copy_status = 'With Reader' and (c.copy_id = active.copy_id or exists (
        select 1 from sora_v2.session_activity_logs l where l.session_id = active.session_id
          and l.copy_id = c.copy_id and l.action = 'KIOSK_BOOK_SCANNED'));
    select coalesce((select l.action = 'CHECKOUT_DISPUTED' from sora_v2.session_activity_logs l
      where l.session_id = active.session_id and l.action in ('CHECKOUT_DISPUTED', 'CHECKOUT_DISPUTE_RESOLVED')
      order by l.log_id desc limit 1), false) into disputed;
  end if;

  return jsonb_build_object(
    'user_id', reader.id, 'name', concat_ws(' ', reader.first_name, reader.last_name),
    'card_uid', card_uid,
    'action', case when active.session_id is not null or sora_v2.kiosk_checkin_time(reader.id) is not null
      then 'CHECKOUT' else 'CHECKIN' end,
    'session_id', active.session_id,
    'session_status', active.session_status,
    'checked_in_at', coalesce(active.checked_in_at, sora_v2.kiosk_checkin_time(reader.id)),
    'seat', case when active.seat_id is not null then
      (select jsonb_build_object('number', s.seat_number, 'area', s.seat_area)
       from sora_v2.seats s where s.seat_id = active.seat_id)
      else sora_v2.kiosk_seat_hold(reader.id) end,
    'books_to_return', pending_books,
    'minutes', case when active.session_id is not null then
      greatest(0, ceil(extract(epoch from (coalesce(active.return_date, now()) - active.borrow_date)) / 60)::integer)
      else 0 end,
    'remaining_minutes', reader.remaining_minutes,
    'total_charge', coalesce(active.food_charge + active.other_charge, 0),
    'payment_status', active.food_other_charges_payment,
    'disputed', disputed,
    'can_check_in', reader.is_active and reader.membership_status = 'ACTIVE'
      and reader.membership_expires_at > now());
end;
$$;

create or replace function sora_v2.admin_reader_station_complete_checkout(p_rfid text, p_session_id integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reader_id uuid; active sora_v2.sessions%rowtype; pending_books integer;
  disputed boolean; used_minutes integer; hold jsonb; held_seat integer;
  card_uid text := sora_v2.normalize_rfid_uid(p_rfid);
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(card_uid, '') is null then raise exception 'Scan a library card'; end if;
  select u.id into reader_id from sora_v2.librarycard c join sora_v2.users u on u.id = c.user_id
    where sora_v2.normalize_rfid_uid(c.librarycard_rfid) = card_uid
      and c.is_active and c.deactivated_at is null and u.user_role = 'Reader'
    limit 1;
  if reader_id is null then raise exception 'No active reader card found'; end if;
  perform 1 from sora_v2.users where id = reader_id for update;
  select * into active from sora_v2.sessions where user_id = reader_id
    and session_status <> 'CLOSED' order by session_id desc limit 1 for update;
  if active.session_id is null then
    if p_session_id is not null or sora_v2.kiosk_checkin_time(reader_id) is null then
      raise exception 'The visit has already ended. Scan the card again'; end if;
    hold := sora_v2.kiosk_seat_hold(reader_id);
    held_seat := (hold->>'seat_id')::integer;
    if held_seat is not null then
      perform 1 from sora_v2.seats where seat_id = held_seat for update;
      if sora_v2.kiosk_seat_hold(reader_id) is not null then
        update sora_v2.seats set seat_status = 'AVAILABLE' where seat_id = held_seat;
        insert into sora_v2.session_activity_logs(user_id, action, details)
          values(reader_id, 'KIOSK_SEAT_RELEASED', jsonb_build_object('seat_id', held_seat)::text);
      end if;
    end if;
    insert into sora_v2.session_activity_logs(user_id, action, details)
      values(reader_id, 'CHECKIN_ENDED', 'Confirmed by librarian ' || sora_v2.current_user_id());
    return jsonb_build_object('checkin_only', true, 'session_id', null);
  end if;
  if active.session_id is distinct from p_session_id then
    raise exception 'The active visit changed. Scan the card again'; end if;
  select count(*) into pending_books from sora_v2.book_copies c
    where c.copy_status = 'With Reader' and (c.copy_id = active.copy_id or exists (
      select 1 from sora_v2.session_activity_logs l where l.session_id = active.session_id
        and l.copy_id = c.copy_id and l.action = 'KIOSK_BOOK_SCANNED'));
  if pending_books > 0 then raise exception 'Return every physical book before checkout'; end if;
  select coalesce((select l.action = 'CHECKOUT_DISPUTED' from sora_v2.session_activity_logs l
    where l.session_id = active.session_id and l.action in ('CHECKOUT_DISPUTED', 'CHECKOUT_DISPUTE_RESOLVED')
    order by l.log_id desc limit 1), false) into disputed;
  if disputed then raise exception 'Resolve the checkout dispute before confirming'; end if;
  if active.food_charge + active.other_charge > 0 and active.food_other_charges_payment <> 'PAID' then
    raise exception 'Settle the charges before confirming checkout'; end if;
  if active.session_status = 'READING' then
    used_minutes := greatest(0, ceil(extract(epoch from now() - active.borrow_date) / 60)::integer);
    update sora_v2.users set remaining_minutes = greatest(0, remaining_minutes - used_minutes)
      where id = reader_id and membership_type <> 'Guild Adventurer';
    update sora_v2.sessions set return_date = now(), session_status = 'CHECKOUT PENDING'
      where session_id = active.session_id;
    insert into sora_v2.session_activity_logs(session_id, user_id, action, details)
      values(active.session_id, reader_id, 'CHECKOUT_STARTED', jsonb_build_object('minutes', used_minutes)::text);
  end if;
  update sora_v2.sessions set session_status = 'CLOSED', released_at = now(), checked_out_at = now()
    where session_id = active.session_id;
  update sora_v2.seats set seat_status = 'AVAILABLE' where seat_id = active.seat_id;
  insert into sora_v2.session_activity_logs(session_id, user_id, action, details)
    values(active.session_id, reader_id, 'CHECKOUT_COMPLETED', 'Confirmed by librarian ' || sora_v2.current_user_id());
  return jsonb_build_object('checkin_only', false, 'session_id', active.session_id,
    'minutes', coalesce(used_minutes, greatest(0, ceil(extract(epoch from (active.return_date - active.borrow_date)) / 60)::integer)));
end;
$$;

revoke all on function sora_v2.admin_reader_station_inspect(text),
  sora_v2.admin_reader_station_complete_checkout(text, integer) from public, anon, authenticated;
grant execute on function sora_v2.admin_reader_station_inspect(text),
  sora_v2.admin_reader_station_complete_checkout(text, integer) to authenticated;

-- Make newly created RPC functions available to PostgREST immediately. This is
-- especially important when the migration is pasted into the Supabase SQL
-- editor instead of being applied by the Supabase CLI.
notify pgrst, 'reload schema';
commit;
