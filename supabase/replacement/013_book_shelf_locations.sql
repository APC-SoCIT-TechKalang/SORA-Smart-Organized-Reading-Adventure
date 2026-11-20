-- Apply after 012. Existing unknown locations stay NULL; staff must verify them.
begin;

alter table sora_v2.book_copies
  add column shelf_location text,
  add column condition_notes text,
  add constraint book_copies_shelf_location_check
    check (shelf_location in ('Shelf A1','Shelf A2','Shelf A3','Shelf A4','Shelf A5'));
alter table sora_v2.book_copies drop constraint book_copies_copy_status_check;
alter table sora_v2.book_copies add constraint book_copies_copy_status_check
  check (copy_status in ('In-Shelf','With Reader','In Return Cart','On Hold','Damaged'));

-- A new copy must have a verified home shelf, including calls from older clients.
create function sora_v2.require_copy_shelf() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.shelf_location is null then raise exception 'Assign a Main Reading Hall shelf before adding a copy'; end if;
  return new;
end;
$$;
create trigger require_copy_shelf before insert on sora_v2.book_copies
  for each row execute function sora_v2.require_copy_shelf();

create function sora_v2.admin_add_located_copy(
  p_book_id integer, p_shelf_location text, p_barcode text default null,
  p_condition_notes text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare next_number integer; new_id integer; base_isbn text;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_shelf_location is null or p_shelf_location not in ('Shelf A1','Shelf A2','Shelf A3','Shelf A4','Shelf A5') then
    raise exception 'Select one of the five Main Reading Hall shelves';
  end if;
  select isbn into base_isbn from sora_v2.books where book_id = p_book_id for update;
  if not found then raise exception 'Book not found'; end if;
  select coalesce(max(copy_number),0)+1 into next_number from sora_v2.book_copies where book_id = p_book_id;
  insert into sora_v2.book_copies(book_id,copy_number,barcode,shelf_location,condition_notes)
  values (p_book_id,next_number,coalesce(nullif(btrim(p_barcode),''),coalesce(base_isbn,'BOOK-'||p_book_id)||'-'||next_number),p_shelf_location,nullif(btrim(p_condition_notes),''))
  returning copy_id into new_id;
  return new_id;
end;
$$;

-- One transaction creates/reuses a title and adds its initially In-Shelf copy.
create function sora_v2.admin_create_located_book(
  p_title text, p_author_firstname text, p_author_lastname text,
  p_book_type text, p_age_rating integer, p_genre text, p_isbn text,
  p_shelf_location text, p_barcode text default null,
  p_condition_notes text default null, p_cover_image_url text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare book integer; isbn_value text := nullif(btrim(p_isbn),'');
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if isbn_value is not null then
    isbn_value := regexp_replace(isbn_value,'[ -]','','g');
    if isbn_value !~ '^([0-9]{9}[0-9Xx]|[0-9]{13})$' then raise exception 'Enter a valid 10 or 13 digit ISBN'; end if;
    perform pg_advisory_xact_lock(hashtextextended(isbn_value,0));
    select book_id into book from sora_v2.books where isbn = isbn_value;
  end if;
  if book is null then
    book := sora_v2.admin_create_book(p_title,p_author_firstname,p_author_lastname,p_book_type,p_age_rating,p_genre,isbn_value);
    if nullif(btrim(p_cover_image_url),'') is not null then
      perform sora_v2.admin_update_book_cover(book,p_cover_image_url);
    end if;
  end if;
  perform sora_v2.admin_add_located_copy(book,p_shelf_location,p_barcode,p_condition_notes);
  return book;
end;
$$;

create function sora_v2.admin_update_copy_location(
  p_copy_id integer, p_shelf_location text, p_status text,
  p_condition_notes text default null, p_damage_charge numeric default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare copy sora_v2.book_copies%rowtype; linked_session integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_status is null or p_status not in ('In-Shelf','With Reader','In Return Cart','On Hold','Damaged')
    or p_shelf_location is null or p_shelf_location not in ('Shelf A1','Shelf A2','Shelf A3','Shelf A4','Shelf A5')
    or p_damage_charge is null or p_damage_charge < 0 then raise exception 'Invalid status, shelf or damage charge'; end if;
  select * into copy from sora_v2.book_copies where copy_id = p_copy_id for update;
  if not found then raise exception 'Copy not found'; end if;
  -- Do not detach inventory from a reading session, including extra kiosk scans.
  if p_status <> copy.copy_status and exists (
    select 1 from sora_v2.sessions s where s.return_date is null and s.session_status <> 'CLOSED'
    and (s.copy_id = p_copy_id or exists (select 1 from sora_v2.session_activity_logs l
      where l.session_id = s.session_id and l.copy_id = p_copy_id and l.action = 'KIOSK_BOOK_SCANNED'))
  ) then raise exception 'Return this copy through the reading session before changing its status'; end if;
  if p_status = 'With Reader' and copy.copy_status <> 'With Reader' then
    raise exception 'Use kiosk scanning to associate a reader with this copy';
  end if;
  if p_damage_charge > 0 then
    if p_status <> 'Damaged' or copy.copy_status = 'Damaged' then raise exception 'Damage charges apply only when first flagging a copy as damaged'; end if;
    select s.session_id into linked_session from sora_v2.sessions s
    where s.session_status <> 'CLOSED' and (s.copy_id = p_copy_id or exists (
      select 1 from sora_v2.session_activity_logs l where l.session_id = s.session_id
        and l.copy_id = p_copy_id and l.action = 'KIOSK_BOOK_SCANNED'))
    order by s.borrow_date desc limit 1 for update;
    if linked_session is null then raise exception 'No unsettled reader session found for this damage charge'; end if;
    update sora_v2.sessions set other_charge = other_charge + p_damage_charge,
      food_other_charges_payment = 'UNPAID', paid_at = null where session_id = linked_session;
  end if;
  update sora_v2.book_copies set shelf_location = p_shelf_location, copy_status = p_status,
    condition_notes = nullif(btrim(p_condition_notes),'') where copy_id = p_copy_id;
  insert into sora_v2.session_activity_logs(user_id,session_id,book_id,copy_id,action,details)
  values (sora_v2.current_user_id(),linked_session,copy.book_id,p_copy_id,'COPY_LOCATION_UPDATED',
    jsonb_build_object('previous_status',copy.copy_status,'status',p_status,'shelf',p_shelf_location,
      'condition_notes',p_condition_notes,'damage_charge',p_damage_charge)::text);
end;
$$;

create or replace function sora_v2.admin_shelve(p_copy_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare copy sora_v2.book_copies%rowtype;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select * into copy from sora_v2.book_copies where copy_id = p_copy_id for update;
  if copy.copy_id is null or copy.copy_status <> 'In Return Cart' then raise exception 'Copy must be on the return cart'; end if;
  perform sora_v2.admin_update_copy_location(p_copy_id,copy.shelf_location,'In-Shelf',copy.condition_notes,0);
end;
$$;

revoke all on function sora_v2.require_copy_shelf(),
  sora_v2.admin_add_located_copy(integer,text,text,text),
  sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text),
  sora_v2.admin_update_copy_location(integer,text,text,text,numeric) from public,anon,authenticated;
grant execute on function sora_v2.admin_add_located_copy(integer,text,text,text),
  sora_v2.admin_create_located_book(text,text,text,text,integer,text,text,text,text,text,text),
  sora_v2.admin_update_copy_location(integer,text,text,text,numeric) to authenticated;
commit;
