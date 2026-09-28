-- Ensure every Supabase Auth user has the application rows required by SORA.
-- Apply after 001_initial_schema.sql, seed.sql, and the other migrations.

begin;

-- Keep this migration safe to apply even if the original integration migration
-- was skipped, partially applied, or applied in a different environment.
insert into public.roles (name, description)
values
  ('reader', 'Authenticated Guild Member or Guild Adventurer'),
  ('admin', 'Staff administrator who manages library operations and system configuration')
on conflict (name) do nothing;

create or replace function public.create_reader_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reader_role_id bigint;
  starting_rank_id bigint;
begin
  select role_id into reader_role_id
  from public.roles
  where name = 'reader';

  if reader_role_id is null then
    raise exception 'The reader role is not configured';
  end if;

  select rank_id into starting_rank_id
  from public.membership_ranks
  where name = 'F';

  insert into public.profiles (user_id, role_id, first_name, last_name)
  values (
    new.id,
    reader_role_id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), 'Reader'),
    coalesce(trim(new.raw_user_meta_data->>'last_name'), '')
  )
  on conflict (user_id) do nothing;

  insert into public.reader_progress (user_id, rank_id)
  values (new.id, starting_rank_id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_reader_profile() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_reader_profile();

-- Repair users created while the trigger was unavailable. The UUID is copied
-- directly from auth.users.id, which preserves the profile/Auth relationship.
insert into public.profiles (user_id, role_id, first_name, last_name)
select
  u.id,
  r.role_id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'first_name'), ''), 'Reader'),
  coalesce(trim(u.raw_user_meta_data->>'last_name'), '')
from auth.users as u
cross join public.roles as r
where r.name = 'reader'
on conflict (user_id) do nothing;

insert into public.reader_progress (user_id, rank_id)
select p.user_id, r.rank_id
from public.profiles as p
left join public.membership_ranks as r on r.name = 'F'
on conflict (user_id) do nothing;

commit;
