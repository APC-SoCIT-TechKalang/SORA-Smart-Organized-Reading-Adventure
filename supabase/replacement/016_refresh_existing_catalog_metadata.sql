-- Refresh reviewed edition metadata when an existing ISBN receives a new copy.
-- Apply after 015_reader_three_book_sessions.sql.
begin;

create or replace function sora_v2.admin_create_located_book(
  p_title text, p_author_firstname text, p_author_lastname text,
  p_book_type text, p_age_rating integer, p_genre text, p_isbn text,
  p_shelf_location text, p_barcode text,
  p_condition_notes text default null, p_cover_image_url text default null,
  p_metadata jsonb default '{}'::jsonb, p_needs_review boolean default false,
  p_acquisition_date date default current_date
) returns integer language plpgsql security definer set search_path = '' as $$
declare book integer; isbn_value text := upper(regexp_replace(coalesce(p_isbn,''),'[^0-9X]','','g')); new_copy integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if not sora_v2.valid_isbn(isbn_value) then raise exception 'Enter a valid ISBN-10 or ISBN-13 checksum'; end if;
  if nullif(btrim(p_barcode),'') is null then raise exception 'Scan a unique physical-copy barcode'; end if;
  if p_shelf_location is null or p_shelf_location not in ('Shelf A1','Shelf A2','Shelf A3','Shelf A4','Shelf A5') then raise exception 'Select one of the five Main Reading Hall shelves'; end if;

  perform pg_advisory_xact_lock(hashtextextended(isbn_value,0));
  select book_id into book from sora_v2.books where isbn = isbn_value for update;
  if book is null then
    book := sora_v2.admin_create_book(p_title,p_author_firstname,p_author_lastname,p_book_type,p_age_rating,p_genre,isbn_value);
  end if;

  update sora_v2.books set
    title=coalesce(nullif(btrim(p_title),''),title),
    original_title=coalesce(nullif(btrim(p_metadata->>'original_title'),''),original_title),
    romanized_title=coalesce(nullif(btrim(p_metadata->>'romanized_title'),''),romanized_title),
    contributors=coalesce(nullif(btrim(p_metadata->>'contributors'),''),contributors),
    series_name=coalesce(nullif(btrim(p_metadata->>'series_name'),''),series_name),
    volume_number=case when coalesce(p_metadata->>'volume_number','') ~ '^[0-9]+$' then (p_metadata->>'volume_number')::integer else volume_number end,
    publisher=coalesce(nullif(btrim(p_metadata->>'publisher'),''),publisher),
    imprint=coalesce(nullif(btrim(p_metadata->>'imprint'),''),imprint),
    publication_date=case when coalesce(p_metadata->>'publication_date','') ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$' then
      (case when length(p_metadata->>'publication_date')=4 then (p_metadata->>'publication_date')||'-01-01' when length(p_metadata->>'publication_date')=7 then (p_metadata->>'publication_date')||'-01' else p_metadata->>'publication_date' end)::date else publication_date end,
    format=coalesce(nullif(btrim(p_metadata->>'format'),''),format),
    book_type=coalesce(nullif(btrim(p_book_type),''),book_type),
    demographic=coalesce(nullif(btrim(p_metadata->>'demographic'),''),demographic),
    themes=coalesce(nullif(btrim(p_metadata->>'themes'),''),themes),
    age_rating=coalesce(p_age_rating,age_rating),
    book_genre=coalesce(nullif(btrim(p_genre),''),book_genre),
    book_description=coalesce(nullif(btrim(p_metadata->>'description'),''),book_description),
    coverimage_url=case when p_cover_image_url is null then coverimage_url else nullif(btrim(p_cover_image_url),'') end,
    metadata_sources=coalesce(p_metadata->'metadata_sources',metadata_sources),
    field_sources=coalesce(p_metadata->'field_sources',field_sources),
    needs_review=coalesce(p_needs_review,false)
  where book_id=book;

  select sora_v2.admin_add_located_copy(book,p_shelf_location,p_barcode,p_condition_notes) into new_copy;
  update sora_v2.book_copies set acquisition_date=coalesce(p_acquisition_date,current_date) where copy_id=new_copy;
  return book;
end;
$$;

revoke all on function sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text,jsonb,boolean,date) from public,anon,authenticated;
grant execute on function sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text,jsonb,boolean,date) to authenticated;
commit;
