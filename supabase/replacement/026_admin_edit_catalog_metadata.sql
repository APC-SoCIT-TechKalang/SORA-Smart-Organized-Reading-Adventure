-- Allow librarians to edit all catalogue metadata from the admin dashboard.
begin;
create or replace function sora_v2.admin_update_catalog_entry(p_book_id integer, p_metadata jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_author_id integer; v_isbn text := upper(regexp_replace(coalesce(p_metadata->>'isbn',''),'[^0-9X]','','g'));
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(btrim(p_metadata->>'title'),'') is null then raise exception 'Title is required'; end if;
  if nullif(btrim(p_metadata->>'author_firstname'),'') is null or nullif(btrim(p_metadata->>'author_lastname'),'') is null then raise exception 'Author name is required'; end if;
  if coalesce(p_metadata->>'age_rating','') !~ '^[0-9]+$' then raise exception 'Minimum age must be a whole number'; end if;
  if v_isbn <> '' and not sora_v2.valid_isbn(v_isbn) then raise exception 'Enter a valid ISBN-10 or ISBN-13 checksum'; end if;
  select author_id into v_author_id from sora_v2.authors where lower(author_firstname)=lower(btrim(p_metadata->>'author_firstname')) and lower(author_lastname)=lower(btrim(p_metadata->>'author_lastname')) order by author_id limit 1;
  if v_author_id is null then insert into sora_v2.authors(author_firstname,author_lastname) values (btrim(p_metadata->>'author_firstname'),btrim(p_metadata->>'author_lastname')) returning author_id into v_author_id; end if;
  update sora_v2.books set author_id=v_author_id, title=btrim(p_metadata->>'title'), original_title=nullif(btrim(p_metadata->>'original_title'),''), romanized_title=nullif(btrim(p_metadata->>'romanized_title'),''), isbn=nullif(v_isbn,''), volume_number=case when coalesce(p_metadata->>'volume_number','') ~ '^[0-9]+$' then (p_metadata->>'volume_number')::integer else null end, publisher=nullif(btrim(p_metadata->>'publisher'),''), publication_date=nullif(p_metadata->>'publication_date','')::date, imprint=nullif(btrim(p_metadata->>'imprint'),''), book_type=coalesce(nullif(btrim(p_metadata->>'book_type'),''),book_type), age_rating=(p_metadata->>'age_rating')::integer, book_genre=coalesce(nullif(btrim(p_metadata->>'genre'),''),'General'), demographic=nullif(btrim(p_metadata->>'demographic'),''), themes=nullif(btrim(p_metadata->>'themes'),''), book_description=nullif(btrim(p_metadata->>'description'),''), coverimage_url=nullif(btrim(p_metadata->>'cover_image_url'),'') where book_id=p_book_id;
  if not found then raise exception 'Book not found'; end if;
end;
$$;
revoke all on function sora_v2.admin_update_catalog_entry(integer,jsonb) from public,anon,authenticated;
grant execute on function sora_v2.admin_update_catalog_entry(integer,jsonb) to authenticated;
commit;
