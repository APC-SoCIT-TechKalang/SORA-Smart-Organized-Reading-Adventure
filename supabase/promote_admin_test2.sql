-- One-time bootstrap for the staff account shown in the admin dashboard.
-- Run this in Supabase Dashboard -> SQL Editor after migrations 001, 002,
-- 003 and seed.sql have been applied.

begin;

insert into public.roles (name, description)
values ('admin', 'Staff administrator who manages library operations and system configuration')
on conflict (name) do update
set description = excluded.description;

-- The UUID is from the auth.users row for admin.test2@example.com.
do $$
declare
  target_user uuid := '8b36a5bc-3e1e-4c1c-8b42-f103b6fd5554';
  admin_role bigint;
begin
  if not exists (
    select 1 from auth.users
    where id = target_user and lower(email) = 'admin.test2@example.com'
  ) then
    raise exception 'The UUID/email pair does not match an auth user';
  end if;

  select role_id into admin_role from public.roles where name = 'admin';

  insert into public.profiles (user_id, role_id, first_name, last_name, is_active)
  select u.id, admin_role,
    coalesce(nullif(trim(u.raw_user_meta_data->>'first_name'), ''), 'Admin'),
    coalesce(trim(u.raw_user_meta_data->>'last_name'), 'User'),
    true
  from auth.users u
  where u.id = target_user
  on conflict (user_id) do update
    set role_id = excluded.role_id,
        is_active = true,
        updated_at = now();

  insert into public.reader_progress (user_id, rank_id)
  values (target_user, (select rank_id from public.membership_ranks where name = 'F'))
  on conflict (user_id) do nothing;
end;
$$;

commit;

-- Verify the result. It should return admin | true.
select u.email, r.name as role, p.is_active
from auth.users u
join public.profiles p on p.user_id = u.id
join public.roles r on r.role_id = p.role_id
where u.id = '8b36a5bc-3e1e-4c1c-8b42-f103b6fd5554';
