begin;

create or replace function sora_v2.admin_update_reader_profile(
  p_user_id uuid, p_first_name text, p_last_name text, p_birthdate date
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_user_id is null or nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null or p_birthdate is null
     or p_birthdate > current_date or length(btrim(p_first_name)) > 255
     or length(btrim(p_last_name)) > 255 then
    raise exception 'Valid reader name and birthday required';
  end if;
  update sora_v2.users set first_name = btrim(p_first_name), last_name = btrim(p_last_name),
    birthdate = p_birthdate, updated_at = now()
  where id = p_user_id and user_role = 'Reader';
  if not found then raise exception 'Reader not found'; end if;
end;
$$;

revoke all on function sora_v2.admin_update_reader_profile(uuid, text, text, date) from public, anon, authenticated;
grant execute on function sora_v2.admin_update_reader_profile(uuid, text, text, date) to authenticated;

commit;
