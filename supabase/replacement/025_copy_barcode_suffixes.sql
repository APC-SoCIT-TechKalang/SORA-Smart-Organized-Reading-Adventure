-- Copy barcode convention:
--   first physical copy  = ISBN
--   second physical copy = ISBN-1
--   third physical copy  = ISBN-2
-- Apply after 024_bulk_registration_idempotency.sql.
begin;

lock table sora_v2.book_copies in access exclusive mode;

-- Move existing values out of the unique namespace before renumbering them.
update sora_v2.book_copies
set barcode = left('__tmp__' || copy_id || replace(gen_random_uuid()::text, '-', ''), 50);

update sora_v2.book_copies c
set barcode = left(
  coalesce(nullif(btrim(b.isbn), ''), 'BOOK-' || b.book_id)
  || case when c.copy_number = 1 then '' else '-' || (c.copy_number - 1)::text end,
  50
)
from sora_v2.books b
where b.book_id = c.book_id;

create or replace function sora_v2.admin_add_located_copy(
  p_book_id integer, p_shelf_location text, p_barcode text default null,
  p_condition_notes text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare next_number integer; new_id integer; base_isbn text; generated_barcode text;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_shelf_location is null or p_shelf_location not in ('Shelf A1','Shelf A2','Shelf A3','Shelf A4','Shelf A5') then
    raise exception 'Select one of the five Main Reading Hall shelves';
  end if;
  select isbn into base_isbn from sora_v2.books where book_id = p_book_id for update;
  if not found then raise exception 'Book not found'; end if;
  select coalesce(max(copy_number),0)+1 into next_number from sora_v2.book_copies where book_id = p_book_id;
  generated_barcode := coalesce(base_isbn, 'BOOK-' || p_book_id)
    || case when next_number = 1 then '' else '-' || (next_number - 1)::text end;
  insert into sora_v2.book_copies(book_id,copy_number,barcode,shelf_location,condition_notes)
  values (p_book_id,next_number,coalesce(nullif(btrim(p_barcode),''),generated_barcode),p_shelf_location,nullif(btrim(p_condition_notes),''))
  returning copy_id into new_id;
  return new_id;
end;
$$;

create or replace function sora_v2.admin_register_books(p_entries jsonb)
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
        barcode_value := isbn_value;
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
        barcode_value := isbn_value || '-' || (next_number - 1);
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

revoke all on function sora_v2.admin_add_located_copy(integer,text,text,text),
  sora_v2.admin_register_books(jsonb) from public,anon,authenticated;
grant execute on function sora_v2.admin_add_located_copy(integer,text,text,text),
  sora_v2.admin_register_books(jsonb) to authenticated;

commit;
