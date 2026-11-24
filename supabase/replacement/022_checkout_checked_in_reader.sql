-- End a librarian-approved check-in even when no book was scanned.
-- Apply after 018_per_book_returns_checkout.sql and 012_library_seat_layout.sql.
begin;

create or replace function sora_v2.kiosk_begin_checkout(p_card_rfid text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reader_id uuid := sora_v2.current_user_id(); active sora_v2.sessions%rowtype;
  used_minutes integer; hold jsonb; held_seat integer; released boolean := false;
begin
  if nullif(btrim(p_card_rfid),'') is null then raise exception 'Tap your library card'; end if;
  -- Seat reservation and the first book scan also lock the reader first.
  perform 1 from sora_v2.users where id=reader_id for update;
  if not found then raise exception 'Reader account required'; end if;
  perform 1 from sora_v2.librarycard c where c.user_id=reader_id
    and c.librarycard_rfid=btrim(p_card_rfid) and c.is_active and c.deactivated_at is null;
  if not found then raise exception 'This library card does not match your session'; end if;
  select * into active from sora_v2.sessions where user_id=reader_id
    and session_status <> 'CLOSED' order by session_id desc limit 1 for update;
  if active.session_id is null then
    if sora_v2.kiosk_checkin_time(reader_id) is null then
      raise exception 'No active check-in or reading session to check out'; end if;
    hold := sora_v2.kiosk_seat_hold(reader_id);
    held_seat := (hold->>'seat_id')::integer;
    if held_seat is not null then
      perform 1 from sora_v2.seats where seat_id=held_seat for update;
      if sora_v2.kiosk_seat_hold(reader_id) is not null then
        update sora_v2.seats set seat_status='AVAILABLE' where seat_id=held_seat;
        insert into sora_v2.session_activity_logs(user_id,action,details)
          values(reader_id,'KIOSK_SEAT_RELEASED',jsonb_build_object('seat_id',held_seat)::text);
        released := true;
      end if;
    end if;
    insert into sora_v2.session_activity_logs(user_id,action)
      values(reader_id,'CHECKIN_ENDED');
    return jsonb_build_object('checkin_only',true,'seat_released',released);
  end if;
  if active.session_status='READING' then
    if (sora_v2.kiosk_checkout_state()->>'books_to_return')::integer > 0 then
      raise exception 'Scan and return each book before checking out'; end if;
    update sora_v2.sessions set session_status='CHECKOUT PENDING',return_date=now()
      where session_id=active.session_id;
    used_minutes := greatest(0,ceil(extract(epoch from now()-active.borrow_date)/60)::integer);
    update sora_v2.users set remaining_minutes=greatest(0,remaining_minutes-used_minutes)
      where id=reader_id and membership_type <> 'Guild Adventurer';
    insert into sora_v2.session_activity_logs(session_id,user_id,action,details)
      values(active.session_id,reader_id,'CHECKOUT_STARTED',jsonb_build_object('minutes',used_minutes)::text);
  end if;
  return sora_v2.kiosk_checkout_state();
end;
$$;

revoke all on function sora_v2.kiosk_begin_checkout(text) from public,anon,authenticated;
grant execute on function sora_v2.kiosk_begin_checkout(text) to authenticated;
commit;
