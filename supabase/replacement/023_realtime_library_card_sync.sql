-- Canonical physical-card matching and live terminal invalidation.
-- Card UIDs remain TEXT so leading zeroes are never converted or discarded.
begin;

create or replace function sora_v2.normalize_rfid_uid(p_uid text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(upper(btrim(coalesce(p_uid, ''))), '[^A-Z0-9]', '', 'g');
$$;

revoke all on function sora_v2.normalize_rfid_uid(text) from public, anon, authenticated;
grant execute on function sora_v2.normalize_rfid_uid(text) to authenticated, service_role;

-- Anonymous kiosk screens must not receive raw card/member rows. This singleton
-- exposes only a monotonically increasing revision number, updated by triggers.
create table if not exists sora_v2.terminal_card_sync (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0,
  changed_at timestamptz not null default now()
);
insert into sora_v2.terminal_card_sync(singleton) values (true)
on conflict (singleton) do nothing;
alter table sora_v2.terminal_card_sync enable row level security;
grant select on sora_v2.terminal_card_sync to anon, authenticated;
drop policy if exists "terminal card revision is visible" on sora_v2.terminal_card_sync;
create policy "terminal card revision is visible" on sora_v2.terminal_card_sync
  for select to anon, authenticated using (true);

create or replace function sora_v2.bump_terminal_card_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update sora_v2.terminal_card_sync
  set revision = revision + 1, changed_at = now()
  where singleton;
  return null;
end;
$$;
revoke all on function sora_v2.bump_terminal_card_sync() from public, anon, authenticated;

drop trigger if exists librarycard_terminal_sync on sora_v2.librarycard;
create trigger librarycard_terminal_sync after insert or update or delete on sora_v2.librarycard
  for each statement execute function sora_v2.bump_terminal_card_sync();
drop trigger if exists users_terminal_sync on sora_v2.users;
create trigger users_terminal_sync after insert or update or delete on sora_v2.users
  for each statement execute function sora_v2.bump_terminal_card_sync();

create or replace function sora_v2.admin_assign_library_card(p_user_id uuid, p_rfid text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized_uid text := sora_v2.normalize_rfid_uid(p_rfid);
  existing_card_id uuid;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if char_length(normalized_uid) < 4 or char_length(normalized_uid) > 50 then
    raise exception 'RFID UID must contain 4 to 50 letters or digits';
  end if;
  perform 1 from sora_v2.users
    where id = p_user_id and user_role = 'Reader' and is_active for update;
  if not found then raise exception 'Reader not found'; end if;

  if exists (
    select 1 from sora_v2.librarycard c
    where sora_v2.normalize_rfid_uid(c.librarycard_rfid) = normalized_uid
      and c.user_id <> p_user_id
  ) then raise exception 'RFID card is already assigned to another reader'; end if;

  select c.librarycard_id into existing_card_id
  from sora_v2.librarycard c
  where c.user_id = p_user_id
    and sora_v2.normalize_rfid_uid(c.librarycard_rfid) = normalized_uid
  order by c.created_at desc limit 1 for update;

  update sora_v2.librarycard
  set is_active = false, deactivated_at = coalesce(deactivated_at, now())
  where user_id = p_user_id
    and is_active
    and (existing_card_id is null or librarycard_id <> existing_card_id);

  if existing_card_id is null then
    insert into sora_v2.librarycard(user_id, librarycard_rfid, is_active, deactivated_at)
      values (p_user_id, normalized_uid, true, null)
      returning librarycard_id into existing_card_id;
  else
    update sora_v2.librarycard
    set librarycard_rfid = normalized_uid, is_active = true, deactivated_at = null
    where librarycard_id = existing_card_id;
  end if;
  return existing_card_id;
end;
$$;

revoke all on function sora_v2.admin_assign_library_card(uuid,text) from public, anon, authenticated;
grant execute on function sora_v2.admin_assign_library_card(uuid,text) to authenticated;

create or replace function sora_v2.admin_activate_membership(
  p_user_id uuid,
  p_membership_type text,
  p_membership_rank text,
  p_remaining_minutes integer,
  p_expires_at timestamptz,
  p_rfid text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_membership_type not in ('Guild Member', 'Guild Adventurer', 'Wanderer')
    or nullif(btrim(p_membership_rank), '') is null
    or p_remaining_minutes is null or p_remaining_minutes < 0
    or p_expires_at is null or p_expires_at <= now() then
    raise exception 'Invalid membership details';
  end if;
  perform 1 from sora_v2.users
  where id = p_user_id and user_role = 'Reader' and is_active for update;
  if not found then raise exception 'Reader not found'; end if;
  if exists (select 1 from sora_v2.users where id = p_user_id
      and membership_status = 'ACTIVE' and membership_expires_at > now()) then
    raise exception 'Reader already has an active membership';
  end if;
  update sora_v2.users
  set membership_type = p_membership_type,
      membership_rank = btrim(p_membership_rank),
      membership_status = 'ACTIVE',
      remaining_minutes = p_remaining_minutes,
      membership_started_at = now(),
      membership_expires_at = p_expires_at
  where id = p_user_id;
  if nullif(sora_v2.normalize_rfid_uid(p_rfid), '') is not null then
    perform sora_v2.admin_assign_library_card(p_user_id, p_rfid);
  end if;
  return p_user_id;
end;
$$;

create or replace function sora_v2.resolve_kiosk_rfid(p_rfid_uid text)
returns table (auth_user_id uuid, user_id uuid, email text, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, u.id, a.email::text, u.first_name::text, u.last_name::text
  from sora_v2.librarycard c
  join sora_v2.users u on u.id = c.user_id
  join auth.users a on a.raw_app_meta_data ->> 'sora_user_id' = u.id::text
  where sora_v2.normalize_rfid_uid(c.librarycard_rfid) = sora_v2.normalize_rfid_uid(p_rfid_uid)
    and c.is_active and c.deactivated_at is null
    and u.is_active and u.user_role = 'Reader'
    and u.membership_status = 'ACTIVE' and u.membership_expires_at > now()
    and a.deleted_at is null and (a.banned_until is null or a.banned_until <= now())
    and a.email is not null
  order by c.created_at desc, a.created_at desc limit 1;
$$;

revoke all on function sora_v2.resolve_kiosk_rfid(text) from public, anon, authenticated;
grant execute on function sora_v2.resolve_kiosk_rfid(text) to service_role;

create or replace function sora_v2.approve_kiosk_checkin(p_rfid text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare reader_id uuid;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian approval required'; end if;
  select u.id into reader_id from sora_v2.librarycard c join sora_v2.users u on u.id = c.user_id
  where sora_v2.normalize_rfid_uid(c.librarycard_rfid) = sora_v2.normalize_rfid_uid(p_rfid)
    and c.is_active and c.deactivated_at is null
    and u.is_active and u.user_role = 'Reader' and u.membership_status = 'ACTIVE'
    and u.membership_expires_at > now() for update of u, c;
  if reader_id is null then raise exception 'Active card and membership required'; end if;
  insert into sora_v2.session_activity_logs(user_id, action, details)
    values(reader_id, 'CHECKIN_APPROVED', 'Identity verified by librarian ' || sora_v2.current_user_id());
  return reader_id;
end;
$$;

create or replace function sora_v2.kiosk_begin_checkout(p_card_rfid text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reader_id uuid := sora_v2.current_user_id(); active sora_v2.sessions%rowtype;
  used_minutes integer; hold jsonb; held_seat integer; released boolean := false;
begin
  if nullif(sora_v2.normalize_rfid_uid(p_card_rfid),'') is null then raise exception 'Tap your library card'; end if;
  perform 1 from sora_v2.users where id=reader_id for update;
  if not found then raise exception 'Reader account required'; end if;
  perform 1 from sora_v2.librarycard c where c.user_id=reader_id
    and sora_v2.normalize_rfid_uid(c.librarycard_rfid) = sora_v2.normalize_rfid_uid(p_card_rfid)
    and c.is_active and c.deactivated_at is null;
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
    insert into sora_v2.session_activity_logs(user_id,action) values(reader_id,'CHECKIN_ENDED');
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

-- Realtime carries invalidation only. Existing RLS remains in force, so an
-- anonymous kiosk cannot read member/card rows; its fresh server lookup is the
-- authoritative zero-delay fallback.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'sora_v2' and tablename = 'librarycard') then
    alter publication supabase_realtime add table sora_v2.librarycard;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'sora_v2' and tablename = 'users') then
    alter publication supabase_realtime add table sora_v2.users;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'sora_v2' and tablename = 'terminal_card_sync') then
    alter publication supabase_realtime add table sora_v2.terminal_card_sync;
  end if;
end;
$$;

commit;
