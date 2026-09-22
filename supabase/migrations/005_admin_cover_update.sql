-- Apply after 003_application_integration.sql.
-- Adds reliable admin cover updates and repairs the known MHA Vol. 1 URL.

begin;

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

update public.books
set cover_image_url = 'https://covers.openlibrary.org/b/id/11762278-L.jpg',
    updated_at = now()
where isbn = '9781421582696'
  and cover_image_url is distinct from 'https://covers.openlibrary.org/b/id/11762278-L.jpg';

commit;

-- Verification: should return the working cover-ID URL.
select book_id, title, isbn, cover_image_url
from public.books
where isbn = '9781421582696';
