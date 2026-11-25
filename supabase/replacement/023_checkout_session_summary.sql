-- Include the books and visit details in the reader's checkout summary.
-- Apply after 022_checkout_checked_in_reader.sql.
begin;

create or replace function sora_v2.kiosk_checkout_state()
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
    'checked_in_at',active.checked_in_at,
    'minutes',greatest(0,ceil(extract(epoch from
      (coalesce(active.return_date,now())-active.borrow_date))/60)::integer),
    'seat',(select jsonb_build_object('number',s.seat_number,'area',s.seat_area)
      from sora_v2.seats s where s.seat_id=active.seat_id),
    'books',(with scanned as (
      select distinct on (l.copy_id) l.copy_id,l.created_at as scanned_at
      from sora_v2.session_activity_logs l
      where l.session_id=active.session_id and l.action='KIOSK_BOOK_SCANNED'
        and l.copy_id is not null
      order by l.copy_id,l.created_at
    ), session_copies as (
      select copy_id,scanned_at from scanned
      union all
      select active.copy_id,active.borrow_date where not exists(select 1 from scanned)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'copy_id',c.copy_id,'title',b.title,
      'author',concat_ws(' ',a.author_firstname,a.author_lastname),
      'copy_number',c.copy_number,
      'returned',exists(select 1 from sora_v2.session_activity_logs l
        where l.session_id=active.session_id and l.copy_id=c.copy_id
          and l.action='KIOSK_BOOK_RETURNED') or c.copy_status <> 'With Reader'
    ) order by sc.scanned_at,c.copy_id),'[]'::jsonb)
    from session_copies sc
    join sora_v2.book_copies c on c.copy_id=sc.copy_id
    join sora_v2.books b on b.book_id=c.book_id
    join sora_v2.authors a on a.author_id=b.author_id),
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

revoke all on function sora_v2.kiosk_checkout_state() from public,anon,authenticated;
grant execute on function sora_v2.kiosk_checkout_state() to authenticated;
commit;
