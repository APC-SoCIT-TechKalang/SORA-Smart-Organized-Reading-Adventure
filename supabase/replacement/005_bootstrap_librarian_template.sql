-- Run only after 001-004 in the test schema.
-- Replace every REPLACE_* value before running. This links one existing
-- Supabase Auth account to the first exact-ERD librarian record.
begin;

do $$
declare
  auth_email text := 'REPLACE_EXISTING_AUTH_EMAIL';
  librarian_first_name text := 'REPLACE_FIRST_NAME';
  librarian_middle_name text := null;
  librarian_last_name text := 'REPLACE_LAST_NAME';
  librarian_username text := 'REPLACE_USERNAME';
  librarian_birthdate date := '2000-01-01';
  librarian_mobile text := 'REPLACE_MOBILE_NUMBER';
  auth_id uuid;
  app_user_id integer;
begin
  if auth_email like 'REPLACE_%'
    or librarian_first_name like 'REPLACE_%'
    or librarian_last_name like 'REPLACE_%'
    or librarian_username like 'REPLACE_%'
    or librarian_mobile like 'REPLACE_%' then
    raise exception 'Replace all template values before running';
  end if;
  select id into auth_id from auth.users where lower(email) = lower(auth_email);
  if auth_id is null then raise exception 'Existing Supabase Auth user not found'; end if;
  if exists (
    select 1 from auth.users
    where raw_app_meta_data ->> 'sora_user_id' is not null
  ) then raise exception 'A replacement-schema Auth link already exists; review it before bootstrapping another'; end if;

  insert into sora_v2.users(first_name, middle_name, last_name, username,
    password_hash, birthdate, user_role, mobile_number)
  values (librarian_first_name, librarian_middle_name, librarian_last_name,
    librarian_username, null, librarian_birthdate, 'Librarian', librarian_mobile)
  returning user_id into app_user_id;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('sora_user_id', app_user_id)
  where id = auth_id;
end;
$$;

commit;
