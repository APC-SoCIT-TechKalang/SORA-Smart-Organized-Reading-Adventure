-- Apply after 001, 002 and seed.sql. All browser writes use the caller's JWT.
begin;

insert into public.roles(name) values ('reader'), ('admin') on conflict do nothing;

-- A row ownership policy alone does not stop a reader changing their role_id.
revoke update on public.profiles from anon, authenticated;
grant update (username, first_name, last_name, birthday, bio, favorite_book_id)
  on public.profiles to authenticated;

create or replace function public.create_reader_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, role_id, first_name, last_name)
  values (new.id, (select role_id from public.roles where name = 'reader'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), 'Reader'),
    coalesce(trim(new.raw_user_meta_data->>'last_name'), ''));
  insert into public.reader_progress(user_id, rank_id)
  values (new.id, (select rank_id from public.membership_ranks where name = 'F'));
  return new;
end;
$$;
revoke all on function public.create_reader_profile() from public;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.create_reader_profile();

-- Backfill accounts created before the registration trigger was installed.
insert into public.profiles(user_id, role_id, first_name, last_name)
select u.id, r.role_id, coalesce(nullif(u.raw_user_meta_data->>'first_name', ''), 'Reader'),
  coalesce(u.raw_user_meta_data->>'last_name', '')
from auth.users u cross join public.roles r where r.name = 'reader'
on conflict (user_id) do nothing;
insert into public.reader_progress(user_id, rank_id)
select user_id, (select rank_id from public.membership_ranks where name = 'F') from public.profiles
on conflict (user_id) do nothing;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m join public.profiles p using(user_id)
    where m.user_id = auth.uid() and p.is_active and m.status = 'ACTIVE'
    and m.started_at <= now() and (m.expires_at is null or m.expires_at > now()));
$$;

grant select on public.books, public.book_genres to anon, authenticated;
grant select on all tables in schema public to authenticated;
create policy "visible book genres" on public.book_genres for select
  using (exists (select 1 from public.books b where b.book_id = book_genres.book_id));

-- Only these tables have direct staff write access. Operational writes are RPCs.
grant insert, update on public.books, public.book_genres, public.book_copies, public.quests to authenticated;
grant usage, select on all sequences in schema public to authenticated;
create policy "staff insert books" on public.books for insert to authenticated with check(public.has_role('admin'));
create policy "staff update books" on public.books for update to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "staff insert copies" on public.book_copies for insert to authenticated with check(public.has_role('admin'));
-- Copy state changes use RPCs so the circulation history stays consistent.
create policy "staff insert genres" on public.book_genres for insert to authenticated with check(public.has_role('admin'));
create policy "staff insert quests" on public.quests for insert to authenticated with check(public.has_role('admin'));
create policy "staff update quests" on public.quests for update to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "staff read all quests" on public.quests for select to authenticated using(public.has_role('admin'));
create policy "staff read memberships" on public.memberships for select to authenticated using(public.has_role('admin'));
create policy "staff read cards" on public.library_cards for select to authenticated using(public.has_role('admin'));
create policy "staff read logs" on public.reading_logs for select to authenticated using(public.has_role('admin'));
create policy "staff read quest progress" on public.quest_progress for select to authenticated using(public.has_role('admin'));
create policy "staff read progress" on public.reader_progress for select to authenticated using(public.has_role('admin'));

create or replace function public.start_reading(p_book_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v public.visits; c public.book_copies; result bigint;
begin
  if not public.is_active_member() then raise exception 'An active membership is required'; end if;
  -- Serialize all starts for a reader, including requests from different tabs.
  perform 1 from public.profiles where user_id = auth.uid() for update;
  select * into v from public.visits where user_id = auth.uid() and status = 'ACTIVE'
    and (scheduled_end_at is null or scheduled_end_at > now()) order by checked_in_at desc limit 1 for update;
  if v.visit_id is null then raise exception 'Ask staff to check you in before starting a book'; end if;
  if not exists(select 1 from public.books where book_id = p_book_id and acquisition_status = 'IN_LIBRARY') then
    raise exception 'This title is not available for reading'; end if;
  if exists(select 1 from public.reading_logs where user_id = auth.uid() and book_id = p_book_id and returned_at is null) then
    raise exception 'This title is already on your reading shelf'; end if;
  -- Restricted shelves require staff handling; do not bypass age/rank restrictions.
  select bc.* into c from public.book_copies bc left join public.shelves s using(shelf_id)
    where bc.book_id = p_book_id and bc.status = 'IN_SHELF'
    and (s.min_age is null and s.access_rank is null)
    order by bc.copy_id limit 1 for update of bc skip locked;
  if c.copy_id is null then raise exception 'No available copy. Ask staff for assistance'; end if;
  insert into public.reading_logs(copy_id, book_id, visit_id, user_id, log_source)
    values(c.copy_id, p_book_id, v.visit_id, auth.uid(), 'WEBSITE') returning reading_log_id into result;
  update public.book_copies set status = 'WITH_READER', updated_at = now() where copy_id = c.copy_id;
  insert into public.circulation_events(copy_id, book_id, visit_id, reading_log_id, event_type, old_status, new_status, initiated_by_type, performed_by)
    values(c.copy_id, p_book_id, v.visit_id, result, 'READING_STARTED', c.status, 'WITH_READER', 'MEMBER', auth.uid());
  return result;
end;
$$;

create or replace function public.finish_reading(p_log_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare l public.reading_logs;
begin
  select * into l from public.reading_logs where reading_log_id = p_log_id for update;
  if l.reading_log_id is null or auth.uid() is null or
    (l.user_id is distinct from auth.uid() and not public.has_role('admin')) then raise exception 'Reading record not accessible'; end if;
  if l.returned_at is not null then return; end if;
  update public.reading_logs set returned_at = now(), reading_status = 'FINISHED',
    total_reading_minutes = greatest(0, floor(extract(epoch from (now() - started_at))/60)::integer), updated_at = now()
    where reading_log_id = p_log_id;
  update public.book_copies set status = 'RETURN_CART', updated_at = now() where copy_id = l.copy_id;
  insert into public.circulation_events(copy_id, book_id, visit_id, reading_log_id, event_type, old_status, new_status, initiated_by_type, performed_by)
    values(l.copy_id, l.book_id, l.visit_id, p_log_id, 'READING_FINISHED', 'WITH_READER', 'RETURN_CART',
      case when public.has_role('admin') then 'ADMIN' else 'MEMBER' end, auth.uid());
end;
$$;

create or replace function public.join_quest(p_quest_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_member() then raise exception 'An active membership is required'; end if;
  if not exists(select 1 from public.quests where quest_id = p_quest_id and status = 'ACTIVE') then raise exception 'Quest is unavailable'; end if;
  insert into public.quest_progress(quest_id, user_id) values(p_quest_id, auth.uid()) on conflict do nothing;
end;
$$;

-- Prevent repeated claims even under concurrent requests. Clients never set points.
create unique index points_one_quest_claim on public.points_ledger(user_id, reference_id) where reason_type = 'QUEST_REWARD';
create or replace function public.claim_quest(p_quest_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare q public.quests;
begin
  if not public.is_active_member() then raise exception 'An active membership is required'; end if;
  perform 1 from public.profiles where user_id = auth.uid() for update;
  select * into q from public.quests where quest_id = p_quest_id;
  if q.quest_id is null or not exists(select 1 from public.quest_progress where quest_id = p_quest_id and user_id = auth.uid() and status = 'COMPLETED') then
    raise exception 'Staff must verify quest completion before claiming'; end if;
  if exists(select 1 from public.points_ledger where user_id = auth.uid() and reason_type = 'QUEST_REWARD' and reference_id = p_quest_id::text) then return; end if;
  if q.points_reward < 0 then raise exception 'Invalid quest reward'; end if;
  insert into public.points_ledger(user_id, amount, reason_type, reference_id) values(auth.uid(), q.points_reward, 'QUEST_REWARD', p_quest_id::text);
  insert into public.reader_progress(user_id, total_points) values(auth.uid(), q.points_reward)
    on conflict(user_id) do update set total_points = reader_progress.total_points + excluded.total_points, updated_at = now();
end;
$$;

create or replace function public.admin_activate_member(p_user_id uuid, p_type_id bigint, p_number text, p_rfid text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare t public.membership_types; dob date;
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  select birthday into dob from public.profiles where user_id = p_user_id and is_active for update;
  if not found then raise exception 'Active reader profile not found'; end if;
  select * into t from public.membership_types where membership_type_id = p_type_id and is_active and entry_type <> 'WALK_IN';
  if t.membership_type_id is null then raise exception 'Select a member plan'; end if;
  if t.min_age is not null and (dob is null or extract(year from age(dob)) < t.min_age) then raise exception 'Reader must save an eligible birthday in their profile first'; end if;
  if nullif(trim(p_number), '') is null or nullif(trim(p_rfid), '') is null then raise exception 'Membership number and physical card UID are required'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Choose a future expiry'; end if;
  if exists(select 1 from public.memberships where user_id = p_user_id and status = 'ACTIVE' and (expires_at is null or expires_at > now())) then raise exception 'Reader already has an active membership'; end if;
  insert into public.memberships(user_id, membership_type_id, membership_number, expires_at, remaining_minutes)
    values(p_user_id, p_type_id, trim(p_number), p_expires_at, case when t.entry_type = 'HOURLY' then 0 else null end);
  insert into public.library_cards(user_id, card_type, rfid_uid) values(p_user_id, 'PHYSICAL', trim(p_rfid));
  insert into public.audit_logs(actor_user_id, action, table_name, record_id) values(auth.uid(), 'ACTIVATE_MEMBER', 'profiles', p_user_id::text);
end;
$$;

create or replace function public.admin_check_in(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.memberships; t public.membership_types;
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  perform 1 from public.profiles where user_id = p_user_id and is_active for update;
  if not found then raise exception 'Active reader profile not found'; end if;
  if exists(select 1 from public.visits where user_id = p_user_id and status = 'ACTIVE') then raise exception 'Reader is already checked in'; end if;
  select * into m from public.memberships where user_id = p_user_id and status = 'ACTIVE' and started_at <= now()
    and (expires_at is null or expires_at > now()) order by started_at desc limit 1 for update;
  if m.membership_id is null then raise exception 'Active membership required'; end if;
  select * into t from public.membership_types where membership_type_id = m.membership_type_id and is_active;
  if t.membership_type_id is null then raise exception 'Membership plan is unavailable'; end if;
  if t.entry_type = 'HOURLY' and coalesce(m.remaining_minutes, 0) <= 0 then raise exception 'Top up minutes before check-in'; end if;
  insert into public.visits(user_id, membership_id, visitor_type, check_in_method, checked_in_by, scheduled_end_at)
    values(p_user_id, m.membership_id, 'MEMBER', 'STAFF', auth.uid(),
      case when t.entry_type = 'HOURLY' then least(now() + make_interval(mins => m.remaining_minutes), m.expires_at) else m.expires_at end);
end;
$$;

create or replace function public.admin_check_out(p_visit_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v public.visits; log_id bigint; used integer;
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  -- Lock profile before visit to match the start-reading lock order.
  perform 1 from public.profiles where user_id = (select user_id from public.visits where visit_id = p_visit_id) for update;
  select * into v from public.visits where visit_id = p_visit_id for update;
  if v.visit_id is null then raise exception 'Visit not found'; end if;
  if v.status <> 'ACTIVE' then return; end if;
  for log_id in select reading_log_id from public.reading_logs where visit_id = p_visit_id and returned_at is null loop
    perform public.finish_reading(log_id);
  end loop;
  used := greatest(0, ceil(extract(epoch from (least(now(), coalesce(v.scheduled_end_at, now())) - v.checked_in_at))/60)::integer);
  update public.memberships set remaining_minutes = greatest(0, remaining_minutes - used), updated_at = now()
    where membership_id = v.membership_id and remaining_minutes is not null;
  update public.visits set checked_out_at = now(), checked_out_by = auth.uid(), status = 'COMPLETED' where visit_id = p_visit_id;
end;
$$;

create or replace function public.admin_top_up(p_membership_id bigint, p_minutes integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  if p_minutes is null or p_minutes <= 0 or p_minutes > 100000 or nullif(trim(p_reason), '') is null then raise exception 'Enter positive minutes and a receipt/reference'; end if;
  -- Lock visit before membership, matching checkout. Minutes are time credit, not a payment.
  perform 1 from public.visits where membership_id = p_membership_id and status = 'ACTIVE' for update;
  update public.memberships set remaining_minutes = remaining_minutes + p_minutes, latest_top_up_at = now(), updated_at = now()
    where membership_id = p_membership_id and status = 'ACTIVE' and remaining_minutes is not null and (expires_at is null or expires_at > now());
  if not found then raise exception 'Active hourly membership not found'; end if;
  update public.visits set scheduled_end_at = least(scheduled_end_at + make_interval(mins => p_minutes),
    (select expires_at from public.memberships where membership_id = p_membership_id))
    where membership_id = p_membership_id and status = 'ACTIVE';
  insert into public.audit_logs(actor_user_id, action, table_name, record_id, new_values, reason)
    values(auth.uid(), 'TOP_UP_MINUTES', 'memberships', p_membership_id::text, jsonb_build_object('minutes', p_minutes), trim(p_reason));
end;
$$;

create or replace function public.admin_shelve(p_copy_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare c public.book_copies;
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  select * into c from public.book_copies where copy_id = p_copy_id for update;
  if c.copy_id is null or c.status <> 'RETURN_CART' then raise exception 'Copy must be on the return cart'; end if;
  update public.book_copies set status = 'IN_SHELF', updated_at = now() where copy_id = p_copy_id;
  insert into public.circulation_events(copy_id, book_id, event_type, old_status, new_status, initiated_by_type, performed_by)
    values(p_copy_id, c.book_id, 'SHELVED', c.status, 'IN_SHELF', 'ADMIN', auth.uid());
end;
$$;

create or replace function public.admin_complete_quest(p_progress_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  update public.quest_progress set status = 'COMPLETED', completed_at = now()
    where quest_progress_id = p_progress_id and status in ('ACTIVE', 'PENDING');
  if not found then raise exception 'Active quest enrollment not found'; end if;
  insert into public.audit_logs(actor_user_id, action, table_name, record_id)
    values(auth.uid(), 'VERIFY_QUEST', 'quest_progress', p_progress_id::text);
end;
$$;

-- PostgreSQL gives functions PUBLIC execution by default; restrict every RPC.
do $$ declare f text; begin
  foreach f in array array['start_reading(bigint)', 'finish_reading(bigint)', 'join_quest(bigint)', 'claim_quest(bigint)',
    'admin_activate_member(uuid,bigint,text,text,timestamp with time zone)', 'admin_check_in(uuid)',
    'admin_check_out(bigint)', 'admin_top_up(bigint,integer,text)', 'admin_shelve(bigint)', 'admin_complete_quest(bigint)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;
commit;
