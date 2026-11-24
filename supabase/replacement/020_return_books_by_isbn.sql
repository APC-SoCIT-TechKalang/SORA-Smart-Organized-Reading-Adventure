-- Accept the selected book's original ISBN as well as its inventory barcode.
-- Apply after 018 (and 019 when installed). Changes no tables or existing rows.
begin;

create or replace function sora_v2.kiosk_return_book(p_session_id integer, p_copy_id integer, p_barcode text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active sora_v2.sessions%rowtype;
  chosen sora_v2.book_copies%rowtype;
  original_isbn text;
  scan text := btrim(coalesce(p_barcode, ''));
  normalized_scan text;
begin
  select * into active from sora_v2.sessions where session_id = p_session_id for update;
  if active.session_id is null or active.user_id is distinct from sora_v2.current_user_id()
    or active.session_status <> 'READING' then raise exception 'Active reading session required'; end if;
  if scan = '' or length(scan) > 100 then raise exception 'Scan the book ISBN or copy barcode'; end if;

  select * into chosen from sora_v2.book_copies where copy_id = p_copy_id for update;
  if chosen.copy_id is null then raise exception 'This copy is not in your reading session'; end if;
  if not exists(select 1 from sora_v2.session_activity_logs l
      where l.session_id = p_session_id and l.copy_id = p_copy_id and l.action = 'KIOSK_BOOK_SCANNED')
    and not (chosen.copy_id = active.copy_id and not exists(
      select 1 from sora_v2.session_activity_logs l
      where l.session_id = p_session_id and l.action = 'KIOSK_BOOK_SCANNED')) then
    raise exception 'This copy is not in your reading session'; end if;

  -- Inventory labels identify a physical copy and take priority over ISBNs.
  if chosen.barcode is distinct from scan then
    if exists(select 1 from sora_v2.book_copies where barcode = scan and copy_id <> p_copy_id) then
      raise exception 'That barcode belongs to a different copy. Scan this book ISBN or its own copy barcode'; end if;
    select isbn into original_isbn from sora_v2.books where book_id = chosen.book_id;
    normalized_scan := upper(regexp_replace(scan, '[-[:space:]]', '', 'g'));
    if normalized_scan !~ '^([0-9]{13}|[0-9]{9}[0-9X])$'
      or original_isbn is null
      or normalized_scan is distinct from upper(regexp_replace(btrim(original_isbn), '[-[:space:]]', '', 'g')) then
      raise exception 'The scanned ISBN or barcode does not match this book'; end if;
  end if;

  if chosen.copy_status <> 'With Reader' or exists(select 1 from sora_v2.session_activity_logs l
    where l.session_id = p_session_id and l.copy_id = p_copy_id and l.action = 'KIOSK_BOOK_RETURNED') then
    raise exception 'This copy has already been returned'; end if;
  update sora_v2.book_copies set copy_status = 'In Return Cart' where copy_id = p_copy_id;
  insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action)
    values(p_session_id,active.user_id,chosen.book_id,p_copy_id,'KIOSK_BOOK_RETURNED');
end;
$$;

revoke all on function sora_v2.kiosk_return_book(integer,integer,text) from public,anon,authenticated;
grant execute on function sora_v2.kiosk_return_book(integer,integer,text) to authenticated;
commit;
