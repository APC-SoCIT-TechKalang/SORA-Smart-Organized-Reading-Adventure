-- Configurable snack rewards, idempotent redemption receipts, and rank-safe spending.
-- Apply after 027_prevent_duplicate_quest_definitions.sql.
begin;

alter table sora_v2.rewards
  add column if not exists reward_category text not null default 'Snacks',
  add column if not exists image_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table sora_v2.rewards drop constraint if exists rewards_category_check;
alter table sora_v2.rewards add constraint rewards_category_check
  check (reward_category in ('Snacks','Drinks'));
alter table sora_v2.rewards drop constraint if exists rewards_points_positive;
alter table sora_v2.rewards add constraint rewards_points_positive check (points_cost > 0) not valid;
alter table sora_v2.rewards validate constraint rewards_points_positive;
alter table sora_v2.rewards drop constraint if exists rewards_stock_nonnegative;
alter table sora_v2.rewards add constraint rewards_stock_nonnegative check (stock_quantity >= 0) not valid;
alter table sora_v2.rewards validate constraint rewards_stock_nonnegative;

alter table sora_v2.redemptions
  add column if not exists redemption_reference uuid not null default gen_random_uuid(),
  add column if not exists request_key uuid,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by uuid references sora_v2.users(id);
create unique index if not exists redemptions_reference_key on sora_v2.redemptions(redemption_reference);
create unique index if not exists redemptions_reader_request_key on sora_v2.redemptions(user_id,request_key) where request_key is not null;

insert into sora_v2.rewards(reward_name,points_cost,stock_quantity,is_available,reward_category)
select item.name,item.cost,0,false,item.category
from (values
  ('Piattos',750,'Snacks'),('Nova',750,'Snacks'),('Chippy',750,'Snacks'),
  ('Oishi Prawn Crackers',750,'Snacks'),('Bottled Water',450,'Drinks'),('C2 Drink',650,'Drinks')
) as item(name,cost,category)
where not exists(select 1 from sora_v2.rewards r where lower(btrim(r.reward_name))=lower(item.name));

create or replace function sora_v2.reader_quest_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare reader_id uuid:=sora_v2.current_user_id(); lifetime_points integer; balance integer; rank_name text; next_rank jsonb;
begin
  if reader_id is null then raise exception 'Reader sign-in required'; end if;
  perform sora_v2.ensure_reader_quest();
  select coalesce(sum(points_awarded),0)::integer into lifetime_points from sora_v2.user_quests where user_id=reader_id;
  balance:=lifetime_points-coalesce((select sum(points_spent) from sora_v2.redemptions where user_id=reader_id and redemption_status<>'CANCELLED'),0)::integer;
  rank_name:=sora_v2.quest_rank_name(lifetime_points);
  next_rank:=case when lifetime_points<250 then jsonb_build_object('name','Story Seeker','points_required',250) when lifetime_points<750 then jsonb_build_object('name','Shelf Adventurer','points_required',750) when lifetime_points<1500 then jsonb_build_object('name','Master Archivist','points_required',1500) else null end;
  return (select jsonb_build_object('rank',rank_name,'membership_tier',u.membership_type,'points',greatest(0,balance),'rank_points',lifetime_points,'last_updated',now(),'next_rank',next_rank,
    'quests',coalesce((select jsonb_agg(jsonb_build_object('user_quest_id',uq.user_quest_id,'quest_id',q.quest_id,'name',q.quest_name,'description',q.quest_description,'difficulty',q.quest_difficulty,
      'objective_type',coalesce(params->>'objective_type','BOOKS_READ'),'current_value',uq.progress_value,'target_value',greatest(1,coalesce((params->>'target_value')::integer,1)),
      'points',q.points_reward,'status',uq.quest_status,'deadline_at',uq.deadline_at,'completed_at',uq.completed_at,'target_genre',q.target_genre,'source',coalesce(params->>'source','MANUAL')) order by uq.assigned_at desc)
      from sora_v2.user_quests uq join sora_v2.quests q on q.quest_id=uq.quest_id
      cross join lateral (select coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb) params) p where uq.user_id=reader_id),'[]'::jsonb))
    from sora_v2.users u where u.id=reader_id);
end; $$;

create or replace function sora_v2.reader_redeem_shop_reward(p_reward_id integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reader_id uuid:=sora_v2.current_user_id(); reward sora_v2.rewards%rowtype; balance integer; existing sora_v2.redemptions%rowtype; created sora_v2.redemptions%rowtype;
begin
  if reader_id is null or not exists(select 1 from sora_v2.users where id=reader_id and user_role='Reader' and is_active) then raise exception 'Active reader sign-in required'; end if;
  if p_request_key is null then raise exception 'A redemption request key is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(reader_id::text,0));
  select * into existing from sora_v2.redemptions where user_id=reader_id and request_key=p_request_key;
  if existing.redemption_id is not null then
    return (select jsonb_build_object('redemption_id',existing.redemption_id,'reference',existing.redemption_reference,'reward_name',r.reward_name,'points_used',existing.points_spent,'redeemed_at',existing.redeemed_at,'status',existing.redemption_status) from sora_v2.rewards r where r.reward_id=existing.reward_id);
  end if;
  select * into reward from sora_v2.rewards where reward_id=p_reward_id for update;
  if reward.reward_id is null or not reward.is_available or reward.stock_quantity<1 then raise exception 'This reward is currently unavailable'; end if;
  select coalesce(sum(points_awarded),0)::integer-coalesce((select sum(points_spent) from sora_v2.redemptions where user_id=reader_id and redemption_status<>'CANCELLED'),0)::integer into balance from sora_v2.user_quests where user_id=reader_id;
  if balance<reward.points_cost then raise exception 'You need % more reward points',reward.points_cost-balance; end if;
  insert into sora_v2.redemptions(user_id,reward_id,points_spent,redemption_status,request_key) values(reader_id,reward.reward_id,reward.points_cost,'PENDING',p_request_key) returning * into created;
  update sora_v2.rewards set stock_quantity=stock_quantity-1,updated_at=now() where reward_id=reward.reward_id;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(reader_id,'REWARD_REDEEMED',jsonb_build_object('redemption_id',created.redemption_id,'reference',created.redemption_reference,'reward_id',reward.reward_id,'points_spent',reward.points_cost)::text);
  return jsonb_build_object('redemption_id',created.redemption_id,'reference',created.redemption_reference,'reward_name',reward.reward_name,'points_used',created.points_spent,'redeemed_at',created.redeemed_at,'status',created.redemption_status);
end; $$;

create or replace function sora_v2.admin_save_reward(p_reward_id integer,p_name text,p_category text,p_points integer,p_stock integer,p_available boolean,p_image_url text)
returns integer language plpgsql security definer set search_path='' as $$
declare saved integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if length(btrim(coalesce(p_name,'')))<2 or p_category not in ('Snacks','Drinks') or p_points<1 or p_stock<0 then raise exception 'Enter valid reward details'; end if;
  if p_reward_id is null then
    insert into sora_v2.rewards(reward_name,reward_category,points_cost,stock_quantity,is_available,image_url) values(btrim(p_name),p_category,p_points,p_stock,coalesce(p_available,false),nullif(btrim(p_image_url),'')) returning reward_id into saved;
  else
    update sora_v2.rewards set reward_name=btrim(p_name),reward_category=p_category,points_cost=p_points,stock_quantity=p_stock,is_available=coalesce(p_available,false),image_url=nullif(btrim(p_image_url),''),updated_at=now() where reward_id=p_reward_id returning reward_id into saved;
    if saved is null then raise exception 'Reward not found'; end if;
  end if;
  return saved;
end; $$;

create or replace function sora_v2.admin_set_redemption_status(p_redemption_id integer,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare item sora_v2.redemptions%rowtype;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_status not in ('FULFILLED','CANCELLED') then raise exception 'Invalid redemption status'; end if;
  select * into item from sora_v2.redemptions where redemption_id=p_redemption_id for update;
  if item.redemption_id is null then raise exception 'Redemption not found'; end if;
  if item.redemption_status<>'PENDING' then raise exception 'Only pending redemptions can be updated'; end if;
  update sora_v2.redemptions set redemption_status=p_status,fulfilled_at=case when p_status='FULFILLED' then now() else null end,fulfilled_by=case when p_status='FULFILLED' then sora_v2.current_user_id() else null end where redemption_id=p_redemption_id;
  if p_status='CANCELLED' then update sora_v2.rewards set stock_quantity=stock_quantity+1,updated_at=now() where reward_id=item.reward_id; end if;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(sora_v2.current_user_id(),'REDEMPTION_'||p_status,jsonb_build_object('redemption_id',item.redemption_id,'reader_id',item.user_id)::text);
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('reward-images','reward-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "public reads reward images" on storage.objects;
create policy "public reads reward images" on storage.objects for select using(bucket_id='reward-images');
drop policy if exists "librarians upload reward images" on storage.objects;
create policy "librarians upload reward images" on storage.objects for insert to authenticated with check(bucket_id='reward-images' and sora_v2.is_librarian());
drop policy if exists "librarians update reward images" on storage.objects;
create policy "librarians update reward images" on storage.objects for update to authenticated using(bucket_id='reward-images' and sora_v2.is_librarian()) with check(bucket_id='reward-images' and sora_v2.is_librarian());

revoke all on function sora_v2.reader_redeem_shop_reward(integer,uuid),sora_v2.admin_save_reward(integer,text,text,integer,integer,boolean,text),sora_v2.admin_set_redemption_status(integer,text) from public,anon,authenticated;
revoke execute on function sora_v2.reader_redeem_reward(integer) from authenticated;
grant execute on function sora_v2.reader_redeem_shop_reward(integer,uuid) to authenticated;
grant execute on function sora_v2.admin_save_reward(integer,text,text,integer,integer,boolean,text),sora_v2.admin_set_redemption_status(integer,text) to authenticated;
commit;
