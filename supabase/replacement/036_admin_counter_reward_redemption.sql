-- Counter redemption using the existing rewards, redemptions and user_quests tables.
begin;

create or replace function sora_v2.admin_reader_reward_balance(p_reader_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare balance integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if not exists (select 1 from sora_v2.users where id=p_reader_id and user_role='Reader' and is_active) then
    raise exception 'Select an active reader';
  end if;
  select coalesce(sum(points_awarded),0)::integer into balance from sora_v2.user_quests where user_id=p_reader_id;
  return greatest(0,balance-coalesce((select sum(points_spent) from sora_v2.redemptions where user_id=p_reader_id and redemption_status<>'CANCELLED'),0)::integer);
end; $$;

create or replace function sora_v2.admin_redeem_reward_for_reader(p_reader_id uuid,p_reward_id integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item sora_v2.rewards%rowtype; previous sora_v2.redemptions%rowtype; created sora_v2.redemptions%rowtype; balance integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_request_key is null then raise exception 'A request key is required'; end if;
  if not exists (select 1 from sora_v2.users where id=p_reader_id and user_role='Reader' and is_active) then raise exception 'Select an active reader'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reader_id::text,0));
  select * into previous from sora_v2.redemptions where user_id=p_reader_id and request_key=p_request_key;
  if previous.redemption_id is not null then
    if previous.reward_id<>p_reward_id then raise exception 'Request key already used for another reward'; end if;
    return (select jsonb_build_object('reference',previous.redemption_reference,'reward_name',r.reward_name,'points_used',previous.points_spent,'status',previous.redemption_status) from sora_v2.rewards r where r.reward_id=previous.reward_id);
  end if;
  select * into item from sora_v2.rewards where reward_id=p_reward_id for update;
  if item.reward_id is null or not item.is_available or item.stock_quantity<1 then raise exception 'Reward is unavailable or out of stock'; end if;
  balance:=sora_v2.admin_reader_reward_balance(p_reader_id);
  if balance<item.points_cost then raise exception 'Reader needs % more points',item.points_cost-balance; end if;
  insert into sora_v2.redemptions(user_id,reward_id,points_spent,redemption_status,request_key,fulfilled_at,fulfilled_by)
    values(p_reader_id,p_reward_id,item.points_cost,'FULFILLED',p_request_key,now(),sora_v2.current_user_id()) returning * into created;
  update sora_v2.rewards set stock_quantity=stock_quantity-1,updated_at=now() where reward_id=p_reward_id;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(sora_v2.current_user_id(),'COUNTER_REWARD_FULFILLED',jsonb_build_object('reader_id',p_reader_id,'reward_id',p_reward_id,'redemption_id',created.redemption_id,'reference',created.redemption_reference,'points_spent',created.points_spent)::text);
  return jsonb_build_object('reference',created.redemption_reference,'reward_name',item.reward_name,'points_used',created.points_spent,'status',created.redemption_status);
end; $$;

revoke all on function sora_v2.admin_reader_reward_balance(uuid),sora_v2.admin_redeem_reward_for_reader(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function sora_v2.admin_reader_reward_balance(uuid),sora_v2.admin_redeem_reward_for_reader(uuid,integer,uuid) to authenticated;
commit;
