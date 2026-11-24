-- UC-09: one transaction registers one or many physical books with generated labels.
-- Apply after 016_refresh_existing_catalog_metadata.sql. Existing rows are untouched.
begin;

create function sora_v2.admin_register_books(p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  entry jsonb;
  results jsonb := '[]'::jsonb;
  row_number integer := 0;
  isbn_value text;
  book integer;
  copy integer;
  next_number integer;
  barcode_value text;
  author_parts text[];
  title_value text;
  shelf_value text;
  age_value integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if coalesce(jsonb_typeof(p_entries),'null') <> 'array' then
    raise exception 'Enter a list of physical copies';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception 'Enter between 1 and 100 physical copies';
  end if;

  for entry in select value from jsonb_array_elements(p_entries) loop
    row_number := row_number + 1;
    begin
      if jsonb_typeof(entry) <> 'object' then raise exception 'Book details are required'; end if;
      isbn_value := upper(regexp_replace(coalesce(entry->>'isbn',''),'[ -]','','g'));
      if coalesce(entry->>'isbn','') !~ '^[0-9Xx -]+$' or not sora_v2.valid_isbn(isbn_value) then
        raise exception 'Enter a valid ISBN-10 or ISBN-13';
      end if;
      shelf_value := nullif(btrim(entry->>'shelf_location'),'');
      if shelf_value is null or shelf_value not in ('Shelf A1','Shelf A2','Shelf A3','Shelf A4','Shelf A5') then
        raise exception 'Select a Main Reading Hall shelf';
      end if;

      -- The ISBN lock also serializes duplicate ISBNs within and across batches.
      perform pg_advisory_xact_lock(hashtextextended(isbn_value,0));
      select b.book_id into book from sora_v2.books b where b.isbn = isbn_value for update;
      if book is null then
        title_value := nullif(btrim(entry->>'title'),'');
        author_parts := regexp_split_to_array(btrim(coalesce(entry->>'author','')), '\s+');
        if title_value is null then raise exception 'Title is required'; end if;
        if array_length(author_parts,1) < 2 then raise exception 'Enter the author first and last name'; end if;
        if nullif(btrim(entry->>'genre'),'') is null then raise exception 'Genre is required'; end if;
        if coalesce(entry->>'age_rating','') !~ '^[0-9]+$' then raise exception 'Age rating is required'; end if;
        age_value := (entry->>'age_rating')::integer;
        if coalesce(entry->>'book_type','') not in ('Manga','Light Novel','Adult Manga') then
          raise exception 'Choose Manga, Light Novel, or Adult Manga';
        end if;
        barcode_value := isbn_value || '-1';
        book := sora_v2.admin_create_located_book(
          title_value, author_parts[1], array_to_string(author_parts[2:array_length(author_parts,1)],' '),
          entry->>'book_type', age_value, entry->>'genre', isbn_value, shelf_value,
          barcode_value, nullif(btrim(entry->>'condition_notes'),''),
          nullif(btrim(entry->>'cover_image_url'),''), coalesce(entry->'metadata','{}'::jsonb),
          coalesce((entry->>'needs_review')::boolean,false),
          coalesce((entry->>'acquisition_date')::date,current_date)
        );
        next_number := 1;
        select c.copy_id into copy from sora_v2.book_copies c where c.barcode = barcode_value;
      else
        select coalesce(max(c.copy_number),0)+1 into next_number
        from sora_v2.book_copies c where c.book_id = book;
        barcode_value := isbn_value || '-' || next_number;
        copy := sora_v2.admin_add_located_copy(
          book, shelf_value, barcode_value, nullif(btrim(entry->>'condition_notes'),'')
        );
        update sora_v2.book_copies set acquisition_date = coalesce((entry->>'acquisition_date')::date,current_date)
        where copy_id = copy;
      end if;
      results := results || jsonb_build_array(jsonb_build_object(
        'book_id',book,'copy_id',copy,'copy_number',next_number,
        'barcode',barcode_value,'title',(select b.title from sora_v2.books b where b.book_id = book)
      ));
    exception when others then
      raise exception 'Row %: %', row_number, sqlerrm;
    end;
  end loop;
  return results;
end;
$$;

revoke all on function sora_v2.admin_register_books(jsonb) from public, anon, authenticated;
grant execute on function sora_v2.admin_register_books(jsonb) to authenticated;
commit;
