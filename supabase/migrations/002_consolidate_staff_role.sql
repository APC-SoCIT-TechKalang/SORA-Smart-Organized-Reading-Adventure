-- SORA Library System
-- Consolidate the former librarian and admin accounts into one application role.
-- Run this after 001 if that migration was already applied before the role decision.

begin;

insert into public.roles (name, description)
values ('admin', 'Staff administrator who manages library operations and system configuration')
on conflict (name) do update
set description = excluded.description;

do $$
declare
  admin_role_id bigint;
begin
  select role_id
    into admin_role_id
  from public.roles
  where name = 'admin';

  update public.profiles p
  set role_id = admin_role_id,
      updated_at = now()
  from public.roles old_role
  where p.role_id = old_role.role_id
    and old_role.name = 'librarian';

  update public.circulation_events
  set initiated_by_type = 'ADMIN'
  where initiated_by_type = 'LIBRARIAN';
end;
$$;

delete from public.roles
where name = 'librarian';

alter table public.circulation_events
  drop constraint if exists circulation_events_initiator_check;

alter table public.circulation_events
  add constraint circulation_events_initiator_check
  check (initiated_by_type in ('MEMBER', 'WALK_IN', 'ADMIN', 'SYSTEM'));

-- Replace policies created by the earlier schema version so they check only admin.
drop policy if exists "active members can read shelves" on public.shelves;
create policy "active members can read shelves"
  on public.shelves for select
  to authenticated
  using (public.is_active_member() or public.has_role('admin'));

drop policy if exists "active members can read ranks" on public.membership_ranks;
create policy "active members can read ranks"
  on public.membership_ranks for select
  to authenticated
  using (public.is_active_member() or public.has_role('admin'));

drop policy if exists "public can search catalog" on public.books;
create policy "public can search catalog"
  on public.books for select
  using (is_primary_book = true or public.is_active_member() or public.has_role('admin'));

drop policy if exists "authenticated users can read available copies" on public.book_copies;
create policy "authenticated users can read available copies"
  on public.book_copies for select
  to authenticated
  using (public.is_active_member() or public.has_role('admin'));

drop policy if exists "authenticated users can read seat map" on public.seats;
create policy "authenticated users can read seat map"
  on public.seats for select
  to authenticated
  using (public.is_active_member() or public.has_role('admin'));

drop policy if exists "staff can read profiles" on public.profiles;
create policy "staff can read profiles"
  on public.profiles for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists "members can read active quests" on public.quests;
create policy "members can read active quests"
  on public.quests for select
  to authenticated
  using (status = 'ACTIVE' and (public.is_active_member() or public.has_role('admin')));

drop policy if exists "members can read active rewards" on public.rewards;
create policy "members can read active rewards"
  on public.rewards for select
  to authenticated
  using (is_active = true and (public.is_active_member() or public.has_role('admin')));

drop policy if exists "staff can read operational tables" on public.visits;
create policy "staff can read operational tables"
  on public.visits for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists "staff can read circulation history" on public.circulation_events;
create policy "staff can read circulation history"
  on public.circulation_events for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists "staff can read audit logs" on public.audit_logs;
create policy "staff can read audit logs"
  on public.audit_logs for select
  to authenticated
  using (public.has_role('admin'));

commit;
