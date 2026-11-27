-- No tables or bulk data updates. Preview and explicitly approve existing titles.
begin;
create or replace function sora_v2.standard_catalog_title(p_title text,p_series text,p_volume integer,p_type text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_type !~* '(manga|light novel)' or nullif(btrim(p_series),'') is null or p_volume is null or p_volume < 0
     or p_series ~ '[ぁ-ヿ一-鿿]' or concat(p_title,' ',p_series) ~* '(omnibus|deluxe|collector|edition|[0-9]+\s*[-–]\s*[0-9]+|[0-9]+\s*-in-\s*[0-9]+)' then return p_title; end if;
  return rtrim(btrim(p_series),', ') || ', Volume ' || p_volume::text;
end; $$;

-- Normalize only recognizable generated/provider variants. Preserve curated titles.
create or replace function sora_v2.normalize_catalog_title_on_write()
returns trigger language plpgsql set search_path = '' as $$
declare suffix text; expected text;
begin
  expected := sora_v2.standard_catalog_title(new.title,new.series_name,new.volume_number,new.book_type);
  if new.title is not distinct from expected then return new; end if;
  if tg_op = 'UPDATE' then
    if new.title = old.title and old.title = sora_v2.standard_catalog_title('',old.series_name,old.volume_number,old.book_type) then
      new.title := expected; return new;
    end if;
  end if;
  if left(lower(new.title),length(btrim(new.series_name))) = lower(btrim(new.series_name)) then
    suffix := btrim(substr(new.title,length(btrim(new.series_name))+1));
    if suffix ~* '^[, :.-]*(vol(ume)?\.?\s*|book\s*)?[0-9]+$' then
      if regexp_replace(suffix,'[^0-9]','','g')::numeric = new.volume_number then new.title := expected; end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists normalize_catalog_title_on_write on sora_v2.books;
create trigger normalize_catalog_title_on_write before insert or update of title,series_name,volume_number,book_type
on sora_v2.books for each row execute function sora_v2.normalize_catalog_title_on_write();

create or replace function sora_v2.admin_preview_catalog_titles()
returns table(book_id integer,isbn text,current_title text,proposed_title text)
language plpgsql security definer set search_path = '' as $$
begin
  -- The Dashboard supplies a librarian JWT. Supabase SQL Editor runs as a
  -- privileged database role without a JWT, so allow only those owner roles.
  if not sora_v2.is_librarian() and session_user not in ('postgres','supabase_admin') then
    raise exception 'Librarian access required';
  end if;
  return query select b.book_id,b.isbn::text,b.title::text,
    sora_v2.standard_catalog_title(b.title,b.series_name,b.volume_number,b.book_type)
    from sora_v2.books b where b.title is distinct from sora_v2.standard_catalog_title(b.title,b.series_name,b.volume_number,b.book_type)
    order by b.book_id;
end; $$;
-- Optimistic comparison prevents a preview from overwriting subsequent edits.
create or replace function sora_v2.admin_apply_catalog_titles(p_approved jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; affected integer; total integer := 0;
begin
  if not sora_v2.is_librarian() and session_user not in ('postgres','supabase_admin') then
    raise exception 'Librarian access required';
  end if;
  if jsonb_typeof(p_approved) is distinct from 'array' or jsonb_array_length(p_approved)>100 then raise exception 'Approve at most 100 titles per batch'; end if;
  for item in select value from jsonb_array_elements(p_approved) loop
    update sora_v2.books b set title=item->>'proposed_title'
    where b.book_id=(item->>'book_id')::integer and b.title=item->>'current_title'
      and item->>'proposed_title'=sora_v2.standard_catalog_title(b.title,b.series_name,b.volume_number,b.book_type);
    get diagnostics affected = row_count; total := total + affected;
  end loop;
  return total;
end; $$;
revoke all on function sora_v2.admin_preview_catalog_titles() from public,anon;
revoke all on function sora_v2.admin_apply_catalog_titles(jsonb) from public,anon;
grant execute on function sora_v2.admin_preview_catalog_titles(),sora_v2.admin_apply_catalog_titles(jsonb) to authenticated;
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
  update sora_v2.books set author_id=v_author_id, series_name=case when p_metadata ? 'series_name' then nullif(btrim(p_metadata->>'series_name'),'') else series_name end, title=btrim(p_metadata->>'title'), original_title=nullif(btrim(p_metadata->>'original_title'),''), romanized_title=nullif(btrim(p_metadata->>'romanized_title'),''), isbn=nullif(v_isbn,''), volume_number=case when coalesce(p_metadata->>'volume_number','') ~ '^[0-9]+$' then (p_metadata->>'volume_number')::integer else null end, publisher=nullif(btrim(p_metadata->>'publisher'),''), publication_date=nullif(p_metadata->>'publication_date','')::date, imprint=nullif(btrim(p_metadata->>'imprint'),''), book_type=coalesce(nullif(btrim(p_metadata->>'book_type'),''),book_type), age_rating=(p_metadata->>'age_rating')::integer, book_genre=coalesce(nullif(btrim(p_metadata->>'genre'),''),'General'), demographic=nullif(btrim(p_metadata->>'demographic'),''), themes=nullif(btrim(p_metadata->>'themes'),''), book_description=nullif(btrim(p_metadata->>'description'),''), coverimage_url=nullif(btrim(p_metadata->>'cover_image_url'),'') where book_id=p_book_id;
  if not found then raise exception 'Book not found'; end if;
end;
$$;
commit;
