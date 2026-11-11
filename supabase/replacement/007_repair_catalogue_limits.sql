-- Keeps imported metadata compatible with the exact ERD column widths.
-- Does not alter tables or columns.
create or replace function sora_v2.admin_create_book(
  p_title text,
  p_author_firstname text,
  p_author_lastname text,
  p_book_type text,
  p_age_rating integer,
  p_genre text default 'General',
  p_isbn text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_author_id integer;
  new_book_id integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(btrim(p_title), '') is null
    or nullif(btrim(p_author_firstname), '') is null
    or nullif(btrim(p_author_lastname), '') is null
    or p_book_type not in ('Manga', 'Light Novel', 'Adult Manga')
    or p_age_rating is null or p_age_rating < 0 then
    raise exception 'Invalid book details';
  end if;
  select a.author_id into v_author_id from sora_v2.authors a
  where a.author_firstname = btrim(p_author_firstname)
    and a.author_lastname = btrim(p_author_lastname)
  order by a.author_id limit 1;
  if v_author_id is null then
    insert into sora_v2.authors(author_firstname, author_lastname)
    values (btrim(p_author_firstname), btrim(p_author_lastname))
    returning author_id into v_author_id;
  end if;
  insert into sora_v2.books(author_id, title, book_type, age_rating,
    book_genre, isbn)
  values (v_author_id, btrim(p_title), p_book_type, p_age_rating,
    left(coalesce(nullif(btrim(p_genre), ''), 'General'), 100),
    nullif(left(btrim(p_isbn), 50), ''))
  returning book_id into new_book_id;
  return new_book_id;
end;
$$;

grant execute on function sora_v2.admin_create_book(text,text,text,text,integer,text,text)
to authenticated;

notify pgrst, 'reload schema';
