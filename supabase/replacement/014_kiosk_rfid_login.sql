-- Run after the current sora_v2 schema/access migrations. No existing data changes.
begin;
create or replace function sora_v2.resolve_kiosk_rfid(p_rfid_uid text)
returns table (auth_user_id uuid, user_id uuid, email text, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, u.id, a.email::text, u.first_name::text, u.last_name::text
  from sora_v2.librarycard c
  join sora_v2.users u on u.id = c.user_id
  join auth.users a on a.raw_app_meta_data ->> 'sora_user_id' = u.id::text
  where c.librarycard_rfid = btrim(p_rfid_uid)
    and c.is_active and c.deactivated_at is null
    and u.is_active and u.user_role = 'Reader'
    and u.membership_status = 'ACTIVE' and u.membership_expires_at > now()
    and a.deleted_at is null and (a.banned_until is null or a.banned_until <= now())
    and a.email is not null
  order by c.created_at desc, a.created_at desc limit 1;
$$;
revoke all on function sora_v2.resolve_kiosk_rfid(text) from public, anon, authenticated;
grant execute on function sora_v2.resolve_kiosk_rfid(text) to service_role;
commit;
