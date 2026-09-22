-- Public cover art shown in the reader catalogue. Only active administrators may upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "public reads book covers" on storage.objects;
create policy "public reads book covers" on storage.objects for select
  using (bucket_id='book-covers');

drop policy if exists "admins upload book covers" on storage.objects;
create policy "admins upload book covers" on storage.objects for insert to authenticated
  with check (bucket_id='book-covers' and public.has_role('admin'));

drop policy if exists "admins update book covers" on storage.objects;
create policy "admins update book covers" on storage.objects for update to authenticated
  using (bucket_id='book-covers' and public.has_role('admin'))
  with check (bucket_id='book-covers' and public.has_role('admin'));

drop policy if exists "admins delete book covers" on storage.objects;
create policy "admins delete book covers" on storage.objects for delete to authenticated
  using (bucket_id='book-covers' and public.has_role('admin'));

-- Use a guarded RPC for catalogue cover changes. This avoids silent zero-row
-- updates when a live project's older books UPDATE policy is incomplete.
create or replace function public.admin_update_book_cover(
  p_book_id bigint,
  p_cover_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_book public.books;
begin
  if not public.has_role('admin') then
    raise exception 'Staff access required';
  end if;

  update public.books
  set cover_image_url = nullif(trim(p_cover_image_url), ''),
      updated_at = now()
  where book_id = p_book_id
  returning * into updated_book;

  if updated_book.book_id is null then
    raise exception 'Book not found';
  end if;

  return jsonb_build_object(
    'book_id', updated_book.book_id,
    'cover_image_url', updated_book.cover_image_url
  );
end;
$$;

revoke all on function public.admin_update_book_cover(bigint, text) from public;
grant execute on function public.admin_update_book_cover(bigint, text) to authenticated;

-- Repair the known My Hero Academia Vol. 1 URL. The ISBN endpoint currently
-- returns 404; this verified Open Library cover-ID endpoint returns image/jpeg.
update public.books
set cover_image_url = 'https://covers.openlibrary.org/b/id/11762278-L.jpg',
    updated_at = now()
where isbn = '9781421582696'
  and cover_image_url = 'https://covers.openlibrary.org/isbn/9781421582696-L.jpg';
