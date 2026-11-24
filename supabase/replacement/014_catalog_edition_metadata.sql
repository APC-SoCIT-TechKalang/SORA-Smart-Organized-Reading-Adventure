-- Rich, reviewable edition metadata and atomic physical-copy creation.
-- Apply after 013_book_shelf_locations.sql.
begin;

alter table sora_v2.books
  add column if not exists contributors text,
  add column if not exists series_name text,
  add column if not exists publication_date date,
  add column if not exists format text not null default 'Physical',
  add column if not exists demographic text,
  add column if not exists themes text,
  add column if not exists metadata_sources jsonb not null default '[]'::jsonb,
  add column if not exists field_sources jsonb not null default '{}'::jsonb,
  add column if not exists needs_review boolean not null default false;

alter table sora_v2.book_copies
  add column if not exists acquisition_date date not null default current_date;

create or replace function sora_v2.valid_isbn(p_value text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare value text := upper(regexp_replace(coalesce(p_value,''),'[^0-9X]','','g'));
declare total integer := 0; i integer;
begin
  if value ~ '^97[89][0-9]{10}$' then
    for i in 1..12 loop total := total + substr(value,i,1)::integer * case when i % 2 = 0 then 3 else 1 end; end loop;
    return ((10 - total % 10) % 10) = substr(value,13,1)::integer;
  elsif value ~ '^[0-9]{9}[0-9X]$' then
    for i in 1..10 loop total := total + (case when substr(value,i,1)='X' then 10 else substr(value,i,1)::integer end) * (11-i); end loop;
    return total % 11 = 0;
  end if;
  return false;
end;
$$;

drop function if exists sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text);
create function sora_v2.admin_create_located_book(
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
    update sora_v2.books set
      original_title=nullif(btrim(p_metadata->>'original_title'),''), romanized_title=nullif(btrim(p_metadata->>'romanized_title'),''),
      contributors=nullif(btrim(p_metadata->>'contributors'),''), series_name=nullif(btrim(p_metadata->>'series_name'),''),
      volume_number=case when coalesce(p_metadata->>'volume_number','') ~ '^[0-9]+$' then (p_metadata->>'volume_number')::integer else null end,
      publisher=nullif(btrim(p_metadata->>'publisher'),''), imprint=nullif(btrim(p_metadata->>'imprint'),''),
      publication_date=case when coalesce(p_metadata->>'publication_date','') ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$' then
        (case when length(p_metadata->>'publication_date')=4 then (p_metadata->>'publication_date')||'-01-01' when length(p_metadata->>'publication_date')=7 then (p_metadata->>'publication_date')||'-01' else p_metadata->>'publication_date' end)::date else null end,
      format=coalesce(nullif(btrim(p_metadata->>'format'),''),'Physical'), demographic=nullif(btrim(p_metadata->>'demographic'),''),
      themes=nullif(btrim(p_metadata->>'themes'),''), book_description=nullif(btrim(p_metadata->>'description'),''),
      metadata_sources=coalesce(p_metadata->'metadata_sources','[]'::jsonb), field_sources=coalesce(p_metadata->'field_sources','{}'::jsonb),
      needs_review=coalesce(p_needs_review,false), coverimage_url=nullif(btrim(p_cover_image_url),'')
    where book_id=book;
  end if;
  select sora_v2.admin_add_located_copy(book,p_shelf_location,p_barcode,p_condition_notes) into new_copy;
  update sora_v2.book_copies set acquisition_date=coalesce(p_acquisition_date,current_date) where copy_id=new_copy;
  return book;
end;
$$;

revoke all on function sora_v2.valid_isbn(text),
  sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text,jsonb,boolean,date)
  from public,anon,authenticated;
grant execute on function sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text,jsonb,boolean,date) to authenticated;
commit;
