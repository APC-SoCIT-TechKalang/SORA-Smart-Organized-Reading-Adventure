-- Return one scanned copy without ending the reader's session, then check out separately.
-- Apply after 017_uc09_add_books.sql. Existing rows are preserved.
begin;

create function sora_v2.kiosk_return_book(p_session_id integer, p_copy_id integer, p_barcode text)
returns void language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype; chosen sora_v2.book_copies%rowtype;
begin
  select * into active from sora_v2.sessions where session_id = p_session_id for update;
  if active.session_id is null or active.user_id is distinct from sora_v2.current_user_id()
    or active.session_status <> 'READING' then raise exception 'Active reading session required'; end if;
  select * into chosen from sora_v2.book_copies where copy_id = p_copy_id for update;
  if chosen.copy_id is null or chosen.barcode is distinct from btrim(p_barcode) then
    raise exception 'Scan the barcode on this specific physical copy'; end if;
  if not exists(select 1 from sora_v2.session_activity_logs l
    where l.session_id = p_session_id and l.copy_id = p_copy_id and l.action = 'KIOSK_BOOK_SCANNED') then
    raise exception 'This copy is not in your reading session'; end if;
  if chosen.copy_status <> 'With Reader' or exists(select 1 from sora_v2.session_activity_logs l
    where l.session_id = p_session_id and l.copy_id = p_copy_id and l.action = 'KIOSK_BOOK_RETURNED') then
    raise exception 'This copy has already been returned'; end if;
  update sora_v2.book_copies set copy_status = 'In Return Cart' where copy_id = p_copy_id;
  insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action)
    values(p_session_id,active.user_id,chosen.book_id,p_copy_id,'KIOSK_BOOK_RETURNED');
end;
$$;

create function sora_v2.reader_book_activity()
returns jsonb language sql stable security definer set search_path = '' as $$
  with scans as (
    select s.session_id,l.copy_id,s.borrow_date,s.return_date,l.created_at as started_at
    from sora_v2.sessions s join sora_v2.session_activity_logs l on l.session_id=s.session_id
    where s.user_id=sora_v2.current_user_id() and l.action='KIOSK_BOOK_SCANNED' and l.copy_id is not null
    union all
    select s.session_id,s.copy_id,s.borrow_date,s.return_date,s.borrow_date
    from sora_v2.sessions s where s.user_id=sora_v2.current_user_id()
      and not exists(select 1 from sora_v2.session_activity_logs l
        where l.session_id=s.session_id and l.action='KIOSK_BOOK_SCANNED')
  ), activity as (
    select scans.*, c.book_id, coalesce((select l.created_at from sora_v2.session_activity_logs l
      where l.session_id=scans.session_id and l.copy_id=scans.copy_id
        and l.action='KIOSK_BOOK_RETURNED' order by l.log_id desc limit 1), scans.return_date) as finished_at
    from scans join sora_v2.book_copies c on c.copy_id=scans.copy_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id',session_id,'copy_id',copy_id,'book_id',book_id,
    'started_at',started_at,'returned_at',finished_at,
    'total_reading_minutes',case when finished_at is null then null else
      greatest(0,floor(extract(epoch from finished_at-started_at)/60)::integer) end
  ) order by started_at), '[]'::jsonb) from activity;
$$;

create function sora_v2.kiosk_checkout_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype; disputed boolean;
begin
  select * into active from sora_v2.sessions
    where user_id=sora_v2.current_user_id() and session_status <> 'CLOSED'
    order by session_id desc limit 1;
  if active.session_id is null then return null; end if;
  select coalesce((select l.action='CHECKOUT_DISPUTED' from sora_v2.session_activity_logs l
    where l.session_id=active.session_id and l.action in ('CHECKOUT_DISPUTED','CHECKOUT_DISPUTE_RESOLVED')
    order by l.log_id desc limit 1),false) into disputed;
  return jsonb_build_object(
    'session_id',active.session_id,'session_status',active.session_status,
    'borrow_date',active.borrow_date,'return_date',active.return_date,
    'food_charge',active.food_charge,'other_charge',active.other_charge,
    'total_charge',active.food_charge+active.other_charge,
    'payment_status',active.food_other_charges_payment,'disputed',disputed,
    'books_to_return',(select count(*) from sora_v2.book_copies c
      where c.copy_status='With Reader' and (c.copy_id=active.copy_id or exists(
        select 1 from sora_v2.session_activity_logs l where l.session_id=active.session_id
        and l.copy_id=c.copy_id and l.action='KIOSK_BOOK_SCANNED')))
  );
end;
$$;

create function sora_v2.kiosk_begin_checkout(p_card_rfid text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype; used_minutes integer;
begin
  if nullif(btrim(p_card_rfid),'') is null then raise exception 'Tap your library card'; end if;
  perform 1 from sora_v2.librarycard c where c.user_id=sora_v2.current_user_id()
    and c.librarycard_rfid=btrim(p_card_rfid) and c.is_active and c.deactivated_at is null;
  if not found then raise exception 'This library card does not match your session'; end if;
  select * into active from sora_v2.sessions where user_id=sora_v2.current_user_id()
    and session_status <> 'CLOSED' order by session_id desc limit 1 for update;
  if active.session_id is null then raise exception 'No active session to check out'; end if;
  if active.session_status='READING' then
    if (sora_v2.kiosk_checkout_state()->>'books_to_return')::integer > 0 then
      raise exception 'Scan and return each book before checking out'; end if;
    update sora_v2.sessions set session_status='CHECKOUT PENDING',return_date=now()
      where session_id=active.session_id;
    used_minutes := greatest(0,ceil(extract(epoch from now()-active.borrow_date)/60)::integer);
    update sora_v2.users set remaining_minutes=greatest(0,remaining_minutes-used_minutes)
      where id=active.user_id and membership_type <> 'Guild Adventurer';
    insert into sora_v2.session_activity_logs(session_id,user_id,action,details)
      values(active.session_id,active.user_id,'CHECKOUT_STARTED',jsonb_build_object('minutes',used_minutes)::text);
  end if;
  return sora_v2.kiosk_checkout_state();
end;
$$;

create function sora_v2.kiosk_dispute_checkout(p_session_id integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype;
begin
  select * into active from sora_v2.sessions where session_id=p_session_id for update;
  if active.session_id is null or active.user_id is distinct from sora_v2.current_user_id()
    or active.session_status <> 'CHECKOUT PENDING' then raise exception 'Pending checkout required'; end if;
  if active.food_charge+active.other_charge <= 0 then raise exception 'There is no charge to dispute'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Explain the charge you are disputing'; end if;
  if (sora_v2.kiosk_checkout_state()->>'disputed')::boolean then raise exception 'A dispute is already awaiting staff review'; end if;
  insert into sora_v2.session_activity_logs(session_id,user_id,action,details)
    values(p_session_id,active.user_id,'CHECKOUT_DISPUTED',left(btrim(p_reason),500));
  return sora_v2.kiosk_checkout_state();
end;
$$;

create function sora_v2.kiosk_complete_checkout(p_session_id integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype;
begin
  select * into active from sora_v2.sessions where session_id=p_session_id for update;
  if active.session_id is null or active.user_id is distinct from sora_v2.current_user_id()
    or active.session_status <> 'CHECKOUT PENDING' then raise exception 'Pending checkout required'; end if;
  if (sora_v2.kiosk_checkout_state()->>'disputed')::boolean then raise exception 'Wait for staff to resolve the disputed charge'; end if;
  if active.food_charge+active.other_charge > 0 and active.food_other_charges_payment <> 'PAID' then
    raise exception 'Settle the displayed charge with staff before completing checkout'; end if;
  update sora_v2.sessions set session_status='CLOSED',released_at=now(),checked_out_at=now()
    where session_id=p_session_id;
  update sora_v2.seats set seat_status='AVAILABLE' where seat_id=active.seat_id;
  insert into sora_v2.session_activity_logs(session_id,user_id,action)
    values(p_session_id,active.user_id,'CHECKOUT_COMPLETED');
  return jsonb_build_object('session_id',p_session_id,'minutes',
    greatest(0,ceil(extract(epoch from active.return_date-active.borrow_date)/60)::integer),
    'total_charge',active.food_charge+active.other_charge);
end;
$$;

-- Keep a finished copy's later shelf/condition status intact when checkout closes.
create or replace function sora_v2.release_session_books()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.session_status='CLOSED' and old.session_status <> 'CLOSED' then
    update sora_v2.book_copies set copy_status='In Return Cart'
      where copy_status='With Reader' and (copy_id=new.copy_id or copy_id in (
        select copy_id from sora_v2.session_activity_logs
        where session_id=new.session_id and action='KIOSK_BOOK_SCANNED'));
    insert into sora_v2.session_activity_logs(session_id,user_id,action)
      values(new.session_id,new.user_id,'CHECKIN_ENDED');
  end if;
  return new;
end;
$$;

create function sora_v2.admin_checkout_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id',s.session_id,'reader',u.first_name||' '||u.last_name,
    'food_charge',s.food_charge,'other_charge',s.other_charge,
    'total_charge',s.food_charge+s.other_charge,
    'payment_status',s.food_other_charges_payment,
    'disputed',coalesce((select l.action='CHECKOUT_DISPUTED' from sora_v2.session_activity_logs l
      where l.session_id=s.session_id and l.action in ('CHECKOUT_DISPUTED','CHECKOUT_DISPUTE_RESOLVED')
      order by l.log_id desc limit 1),false),
    'reason',(select l.details from sora_v2.session_activity_logs l where l.session_id=s.session_id
      and l.action='CHECKOUT_DISPUTED' order by l.log_id desc limit 1)
  ) order by s.return_date desc),'[]'::jsonb) into result
  from sora_v2.sessions s join sora_v2.users u on u.id=s.user_id
  where s.session_status='CHECKOUT PENDING';
  return result;
end;
$$;

create function sora_v2.admin_adjust_checkout_charge(p_session_id integer, p_food_charge numeric, p_other_charge numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_food_charge is null or p_other_charge is null or p_food_charge < 0 or p_other_charge < 0 then
    raise exception 'Enter nonnegative charges'; end if;
  select * into active from sora_v2.sessions where session_id=p_session_id for update;
  if active.session_id is null or active.session_status <> 'CHECKOUT PENDING' then raise exception 'Pending checkout required'; end if;
  update sora_v2.sessions set food_charge=p_food_charge,other_charge=p_other_charge,
    food_other_charges_payment='UNPAID',food_other_payment_method=null,
    food_other_payment_reference=null,paid_at=null where session_id=p_session_id;
  insert into sora_v2.session_activity_logs(session_id,user_id,action,details)
    values(p_session_id,active.user_id,'CHECKOUT_DISPUTE_RESOLVED',
      jsonb_build_object('food_charge',p_food_charge,'other_charge',p_other_charge)::text);
end;
$$;

create function sora_v2.admin_mark_checkout_paid(p_session_id integer, p_method text, p_reference text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare active sora_v2.sessions%rowtype;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_method not in ('Cash','Gcash','Card') then raise exception 'Select a payment method'; end if;
  select * into active from sora_v2.sessions where session_id=p_session_id for update;
  if active.session_id is null or active.session_status <> 'CHECKOUT PENDING' then raise exception 'Pending checkout required'; end if;
  if active.food_charge+active.other_charge <= 0 then raise exception 'No payment is due'; end if;
  if coalesce((select l.action='CHECKOUT_DISPUTED' from sora_v2.session_activity_logs l
    where l.session_id=p_session_id and l.action in ('CHECKOUT_DISPUTED','CHECKOUT_DISPUTE_RESOLVED')
    order by l.log_id desc limit 1),false) then raise exception 'Resolve the disputed charge first'; end if;
  update sora_v2.sessions set food_other_charges_payment='PAID',food_other_payment_method=p_method,
    food_other_payment_reference=nullif(btrim(p_reference),''),paid_at=now()
    where session_id=p_session_id;
  insert into sora_v2.session_activity_logs(session_id,user_id,action,details)
    values(p_session_id,active.user_id,'CHECKOUT_PAYMENT_RECORDED',p_method);
end;
$$;

revoke all on function sora_v2.kiosk_return_book(integer,integer,text),
  sora_v2.reader_book_activity(),sora_v2.kiosk_checkout_state(),
  sora_v2.kiosk_begin_checkout(text),sora_v2.kiosk_dispute_checkout(integer,text),
  sora_v2.kiosk_complete_checkout(integer),sora_v2.admin_checkout_queue(),
  sora_v2.admin_adjust_checkout_charge(integer,numeric,numeric),
  sora_v2.admin_mark_checkout_paid(integer,text,text)
  from public,anon,authenticated;
grant execute on function sora_v2.kiosk_return_book(integer,integer,text),
  sora_v2.reader_book_activity(),sora_v2.kiosk_checkout_state(),
  sora_v2.kiosk_begin_checkout(text),sora_v2.kiosk_dispute_checkout(integer,text),
  sora_v2.kiosk_complete_checkout(integer) to authenticated;
grant execute on function sora_v2.admin_checkout_queue(),
  sora_v2.admin_adjust_checkout_charge(integer,numeric,numeric),
  sora_v2.admin_mark_checkout_paid(integer,text,text) to authenticated;
commit;
