begin;

create or replace function sora_v2.admin_bulk_update_copy_locations(
  p_copy_ids integer[], p_shelf_location text, p_status text,
  p_condition_notes text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare copy_id integer; updated_count integer := 0;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_copy_ids is null or cardinality(p_copy_ids) = 0 or cardinality(p_copy_ids) > 5000 then
    raise exception 'Select between 1 and 5000 copies';
  end if;
  if p_status = 'With Reader' then raise exception 'Use kiosk scanning to associate a reader with a copy'; end if;
  for copy_id in select distinct unnest(p_copy_ids) order by 1 loop
    perform sora_v2.admin_update_copy_location(copy_id, p_shelf_location, p_status, p_condition_notes, 0);
    updated_count := updated_count + 1;
  end loop;
  return updated_count;
end;
$$;

revoke all on function sora_v2.admin_bulk_update_copy_locations(integer[], text, text, text) from public, anon, authenticated;
grant execute on function sora_v2.admin_bulk_update_copy_locations(integer[], text, text, text) to authenticated;

commit;
