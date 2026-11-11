-- Irreversible production cutover.
-- Keeps sora_v2, the book-covers bucket, and only soraadmin@sora.com in Auth.
-- Run only after 001-005 succeed and the librarian link is verified.
begin;

do $$
declare
  keeper_count integer;
  linked_count integer;
begin
  select count(*) into keeper_count
  from auth.users
  where lower(email) = lower('soraadmin@sora.com');

  select count(*) into linked_count
  from auth.users au
  join sora_v2.users u
    on au.raw_app_meta_data ->> 'sora_user_id' = u.user_id::text
  where lower(au.email) = lower('soraadmin@sora.com')
    and u.user_role = 'Librarian';

  if keeper_count <> 1 or linked_count <> 1 then
    raise exception 'Cutover stopped: verified soraadmin librarian link not found';
  end if;
end;
$$;

-- The replacement account-creation route inserts sora_v2.users itself.
drop trigger if exists on_auth_user_created on auth.users;

-- Keep cover uploads working after the legacy public.has_role function is gone.
drop policy if exists "public reads book covers" on storage.objects;
drop policy if exists "admins upload book covers" on storage.objects;
drop policy if exists "admins update book covers" on storage.objects;
drop policy if exists "admins delete book covers" on storage.objects;

create policy "public reads book covers"
on storage.objects for select
using (bucket_id = 'book-covers');

create policy "librarians upload book covers"
on storage.objects for insert to authenticated
with check (bucket_id = 'book-covers' and sora_v2.is_librarian());

create policy "librarians update book covers"
on storage.objects for update to authenticated
using (bucket_id = 'book-covers' and sora_v2.is_librarian())
with check (bucket_id = 'book-covers' and sora_v2.is_librarian());

create policy "librarians delete book covers"
on storage.objects for delete to authenticated
using (bucket_id = 'book-covers' and sora_v2.is_librarian());

-- Exact legacy application tables from supabase/migrations.
drop table if exists
  public.kiosk_login_requests,
  public.catalog_lookup_requests,
  public.catalog_sync_logs,
  public.audit_logs,
  public.ai_requests,
  public.redemptions,
  public.rewards,
  public.badge_awards,
  public.badges,
  public.points_ledger,
  public.quest_progress,
  public.quests,
  public.reader_progress,
  public.membership_ranks,
  public.circulation_events,
  public.reading_logs,
  public.seat_assignments,
  public.visits,
  public.seats,
  public.kiosks,
  public.book_copies,
  public.book_genres,
  public.books,
  public.shelves,
  public.library_cards,
  public.memberships,
  public.membership_types,
  public.profiles,
  public.roles
cascade;

-- Remove only known legacy routines; leave Supabase/extension routines alone.
do $$
declare
  routine record;
begin
  for routine in
    select p.oid::regprocedure as identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'create_reader_profile', 'is_active_member', 'start_reading',
        'finish_reading', 'join_quest', 'claim_quest',
        'admin_activate_member', 'admin_check_in', 'admin_check_out',
        'admin_top_up', 'admin_shelve', 'admin_complete_quest',
        'enforce_max_active_reading_logs', 'has_role',
        'admin_update_book_cover', 'canonical_isbn',
        'consume_catalog_lookup', 'admin_create_catalog_entry',
        'kiosk_begin_login', 'kiosk_login_status', 'kiosk_end_session',
        'admin_list_kiosk_requests', 'admin_approve_kiosk_login',
        'resolve_kiosk_rfid', 'kiosk_rfid_lookup'
      ])
  loop
    execute format('drop function if exists %s cascade', routine.identity);
  end loop;
end;
$$;

-- Permanently remove every old Auth identity except the new librarian.
delete from auth.users
where lower(coalesce(email, '')) <> lower('soraadmin@sora.com');

commit;

-- Expected: 16 replacement tables, 1 Auth user, 1 linked librarian,
-- and 0 legacy application tables.
select 'replacement_tables' as metric, count(*)::bigint as value
from information_schema.tables
where table_schema = 'sora_v2' and table_type = 'BASE TABLE'
union all
select 'remaining_auth_users', count(*) from auth.users
union all
select 'linked_librarians', count(*)
from auth.users au
join sora_v2.users u
  on au.raw_app_meta_data ->> 'sora_user_id' = u.user_id::text
where u.user_role = 'Librarian'
union all
select 'legacy_app_tables', count(*)
from information_schema.tables
where table_schema = 'public'
  and table_name = any (array[
    'roles','profiles','membership_types','memberships','library_cards',
    'shelves','books','book_genres','book_copies','kiosks','seats','visits',
    'seat_assignments','reading_logs','circulation_events','membership_ranks',
    'reader_progress','quests','quest_progress','points_ledger','badges',
    'badge_awards','rewards','redemptions','ai_requests','audit_logs',
    'catalog_sync_logs','catalog_lookup_requests','kiosk_login_requests'
  ]);
