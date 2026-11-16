-- Reader operations for the merged users/membership design.
begin;

create unique index if not exists one_open_session_per_copy
  on sora_v2.sessions(copy_id) where session_status <> 'CLOSED';
create unique index if not exists one_open_session_per_reader
  on sora_v2.sessions(user_id) where session_status <> 'CLOSED';

create function sora_v2.start_reading(
  p_book_id integer,
  p_user_id uuid default null,
  p_seat_id integer default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  reader_id uuid := coalesce(p_user_id, sora_v2.current_user_id());
  reader sora_v2.users%rowtype;
  selected_seat sora_v2.seats%rowtype;
  selected_copy sora_v2.book_copies%rowtype;
  new_session_id integer;
begin
  if reader_id is null then raise exception 'Sign in to start reading'; end if;
  if reader_id is distinct from sora_v2.current_user_id()
    and not sora_v2.is_librarian() then
    raise exception 'Librarian access is required for another reader';
  end if;
  select * into reader from sora_v2.users where id = reader_id for update;
  if reader.id is null or not reader.is_active then
    raise exception 'Active reader account not found';
  end if;
  if reader.membership_status <> 'ACTIVE'
    or reader.membership_expires_at is null
    or reader.membership_expires_at <= now() then
    raise exception 'An active membership is required';
  end if;
  if reader.membership_type <> 'Guild Adventurer'
    and reader.remaining_minutes <= 0 then
    raise exception 'Ask staff to add reading time';
  end if;
  if exists (select 1 from sora_v2.sessions
      where user_id = reader_id and session_status <> 'CLOSED') then
    raise exception 'Finish a book before starting another';
  end if;

  select * into selected_seat from sora_v2.seats
  where seat_status = 'AVAILABLE'
    and (p_seat_id is null or seat_id = p_seat_id)
  order by seat_id limit 1 for update skip locked;
  if selected_seat.seat_id is null then raise exception 'No seat is available'; end if;

  select * into selected_copy from sora_v2.book_copies
  where book_id = p_book_id and copy_status = 'In-Shelf'
  order by copy_id limit 1 for update skip locked;
  if selected_copy.copy_id is null then raise exception 'No copy is available'; end if;

  insert into sora_v2.sessions(user_id, copy_id, seat_id, checked_in_at)
  values (reader_id, selected_copy.copy_id, selected_seat.seat_id, now())
  returning session_id into new_session_id;
  update sora_v2.book_copies set copy_status = 'With Reader'
  where copy_id = selected_copy.copy_id;
  update sora_v2.seats set seat_status = 'OCCUPIED'
  where seat_id = selected_seat.seat_id;
  insert into sora_v2.session_activity_logs(session_id, user_id, book_id, copy_id, action)
  values (new_session_id, reader_id, p_book_id, selected_copy.copy_id, 'READING_STARTED');
  return new_session_id;
end;
$$;

create function sora_v2.finish_reading(p_session_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_session sora_v2.sessions%rowtype;
  book_id integer;
  used_minutes integer;
begin
  perform 1 from sora_v2.users
  where id = (select user_id from sora_v2.sessions where session_id = p_session_id)
  for update;
  select * into active_session from sora_v2.sessions
  where session_id = p_session_id for update;
  if active_session.session_id is null then raise exception 'Session not found'; end if;
  if active_session.user_id is distinct from sora_v2.current_user_id()
    and not sora_v2.is_librarian() then
    raise exception 'Session is not accessible';
  end if;
  if active_session.session_status = 'CLOSED' then return; end if;
  select c.book_id into book_id from sora_v2.book_copies c
  where c.copy_id = active_session.copy_id;

  update sora_v2.sessions
  set session_status = 'CLOSED', return_date = now(),
      released_at = now(), checked_out_at = now()
  where session_id = p_session_id;
  update sora_v2.book_copies set copy_status = 'In Return Cart'
  where copy_id = active_session.copy_id;
  update sora_v2.seats set seat_status = 'AVAILABLE'
  where seat_id = active_session.seat_id;
  used_minutes := greatest(0, ceil(extract(epoch from
    (now() - active_session.borrow_date)) / 60)::integer);
  update sora_v2.users
  set remaining_minutes = greatest(0, remaining_minutes - used_minutes)
  where id = active_session.user_id
    and membership_type <> 'Guild Adventurer';
  insert into sora_v2.session_activity_logs(session_id, user_id, book_id, copy_id, action)
  values (p_session_id, active_session.user_id, book_id,
          active_session.copy_id, 'READING_FINISHED');
end;
$$;

create function sora_v2.join_quest(p_quest_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare reader_id uuid := sora_v2.current_user_id();
begin
  if reader_id is null then raise exception 'Sign in to join a quest'; end if;
  perform 1 from sora_v2.users where id = reader_id and is_active for update;
  if not found then raise exception 'Active user account required'; end if;
  if not exists (
    select 1 from sora_v2.quests
    where quest_id = p_quest_id and review_decision = 'VERIFIED'
  ) then raise exception 'Quest is unavailable'; end if;
  if not exists (
    select 1 from sora_v2.user_quests
    where user_id = reader_id and quest_id = p_quest_id
  ) then
    insert into sora_v2.user_quests(user_id, quest_id)
    values (reader_id, p_quest_id);
  end if;
end;
$$;

create function sora_v2.claim_quest(p_quest_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare reader_id uuid := sora_v2.current_user_id();
begin
  if reader_id is null then raise exception 'Sign in to claim points'; end if;
  perform 1 from sora_v2.users where id = reader_id and is_active for update;
  if not found then raise exception 'Active user account required'; end if;
  update sora_v2.user_quests uq
  set points_awarded = q.points_reward
  from sora_v2.quests q
  where uq.quest_id = q.quest_id and uq.user_id = reader_id
    and uq.quest_id = p_quest_id and uq.quest_status = 'COMPLETED'
    and uq.points_awarded = 0 and q.points_reward > 0;
  if not found and not exists (
    select 1 from sora_v2.user_quests
    where user_id = reader_id and quest_id = p_quest_id
      and quest_status = 'COMPLETED' and points_awarded > 0
  ) then raise exception 'Staff must verify quest completion first'; end if;
end;
$$;

create function sora_v2.points_balance()
returns integer language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(points_awarded) from sora_v2.user_quests
      where user_id = sora_v2.current_user_id()), 0)::integer
    - coalesce((select sum(points_spent) from sora_v2.redemptions
      where user_id = sora_v2.current_user_id()
        and redemption_status <> 'CANCELLED'), 0)::integer;
$$;

revoke all on function sora_v2.start_reading(integer,uuid,integer) from public, anon, authenticated;
revoke all on function sora_v2.finish_reading(integer) from public, anon, authenticated;
revoke all on function sora_v2.join_quest(integer) from public, anon, authenticated;
revoke all on function sora_v2.claim_quest(integer) from public, anon, authenticated;
revoke all on function sora_v2.points_balance() from public, anon, authenticated;
grant execute on function sora_v2.start_reading(integer,uuid,integer) to authenticated;
grant execute on function sora_v2.finish_reading(integer) to authenticated;
grant execute on function sora_v2.join_quest(integer) to authenticated;
grant execute on function sora_v2.claim_quest(integer) to authenticated;
grant execute on function sora_v2.points_balance() to authenticated;

commit;
