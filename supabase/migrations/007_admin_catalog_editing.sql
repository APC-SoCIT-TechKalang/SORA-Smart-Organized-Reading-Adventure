create or replace function public.admin_update_catalog_entry(
  p_book_id bigint,
  p_book jsonb,
  p_genres text[] default '{}'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  if nullif(trim(p_book->>'title'), '') is null then raise exception 'Title is required'; end if;
  update public.books set
    title = trim(p_book->>'title'), original_title = nullif(trim(p_book->>'original_title'), ''),
    romanized_title = nullif(trim(p_book->>'romanized_title'), ''), author = nullif(trim(p_book->>'author'), ''),
    contributors = nullif(trim(p_book->>'contributors'), ''), isbn = nullif(trim(p_book->>'isbn'), ''),
    series_name = nullif(trim(p_book->>'series_name'), ''), volume_number = nullif(trim(p_book->>'volume_number'), ''),
    publisher = nullif(trim(p_book->>'publisher'), ''), imprint = nullif(trim(p_book->>'imprint'), ''),
    demographic = nullif(trim(p_book->>'demographic'), ''), age_rating = nullif(trim(p_book->>'age_rating'), ''),
    themes = nullif(trim(p_book->>'themes'), ''), description = nullif(trim(p_book->>'description'), ''),
    cover_image_url = nullif(trim(p_book->>'cover_image_url'), ''), acquisition_status = coalesce(nullif(p_book->>'acquisition_status',''), acquisition_status), updated_at = now()
  where book_id = p_book_id;
  if not found then raise exception 'Book not found'; end if;
  delete from public.book_genres where book_id = p_book_id;
  insert into public.book_genres(book_id, genre)
    select p_book_id, trim(value) from unnest(coalesce(p_genres, '{}')) value where nullif(trim(value), '') is not null on conflict do nothing;
end;
$$;

create or replace function public.admin_delete_catalog_entry(p_book_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  if exists (select 1 from public.book_copies where book_id = p_book_id) then raise exception 'Remove physical copies before deleting this title'; end if;
  delete from public.books where book_id = p_book_id;
  if not found then raise exception 'Book not found'; end if;
end;
$$;

revoke all on function public.admin_update_catalog_entry(bigint, jsonb, text[]) from public;
grant execute on function public.admin_update_catalog_entry(bigint, jsonb, text[]) to authenticated;
revoke all on function public.admin_delete_catalog_entry(bigint) from public;
grant execute on function public.admin_delete_catalog_entry(bigint) to authenticated;
