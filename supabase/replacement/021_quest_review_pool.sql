-- UC-10 through UC-16: librarian-reviewed quest pool and refinement persistence.
-- Apply after 019_quest_gamification_existing_schema.sql. Migration 020 is reserved for ISBN returns.
begin;

create or replace function sora_v2.quest_catalog_capacity(p_genre text)
returns integer language sql stable security definer set search_path='' as $$
  select count(distinct b.book_id)::integer
  from sora_v2.books b
  where (nullif(btrim(p_genre),'') is null or lower(b.book_genre) like '%'||lower(btrim(p_genre))||'%')
    and exists(select 1 from sora_v2.book_copies c where c.book_id=b.book_id and c.copy_status='In-Shelf')
$$;

create or replace function sora_v2.admin_create_quest_draft(
  p_name text,p_difficulty text,p_description text,p_objective_type text,
  p_target_value integer,p_points integer,p_days integer,p_target_genre text,
  p_source text,p_feasibility text default null,p_feedback_context text default null
) returns integer language plpgsql security definer set search_path='' as $$
declare new_id integer; min_target integer; max_target integer; min_points integer; max_points integer; min_minutes integer; capacity integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select case p_difficulty when 'Easy' then 1 when 'Medium' then 2 when 'Hard' then 3 end,
    case p_difficulty when 'Easy' then 2 when 'Medium' then 3 when 'Hard' then 5 end,
    case p_difficulty when 'Easy' then 30 when 'Medium' then 80 when 'Hard' then 150 end,
    case p_difficulty when 'Easy' then 80 when 'Medium' then 160 when 'Hard' then 300 end,
    case p_difficulty when 'Easy' then 5 when 'Medium' then 10 when 'Hard' then 15 end
    into min_target,max_target,min_points,max_points,min_minutes;
  capacity:=sora_v2.quest_catalog_capacity(p_target_genre);
  if min_target is null or p_objective_type not in ('BOOKS_READ','READING_MINUTES')
    or p_target_value not between min_target and (case when p_objective_type='READING_MINUTES' then 10000 else max_target end)
    or p_points not between min_points and max_points or p_days not between 1 and 90
    or p_source not in ('AI','TEMPLATE','MANUAL') or length(btrim(p_name))<3 or length(btrim(p_description))<10
    or (p_objective_type='BOOKS_READ' and capacity<p_target_value)
  then raise exception 'Quest is outside configured rules or current catalog capacity'; end if;
  insert into sora_v2.quests(quest_name,quest_difficulty,quest_description,quest_requirement,target_genre,time_limit_days,points_reward,review_decision,revised_parameters)
  values(left(btrim(p_name),255),p_difficulty,left(btrim(p_description),255),left(btrim(p_description),255),nullif(btrim(p_target_genre),''),p_days,p_points,'PENDING',
    jsonb_build_object('objective_type',p_objective_type,'target_value',p_target_value,'minimum_session_minutes',min_minutes,'source',p_source,
      'generation_status','AWAITING_REVIEW','catalog_capacity',capacity,'feasibility',left(coalesce(p_feasibility,''),500),
      'feedback_context',left(coalesce(p_feedback_context,''),1000))::json)
  returning quest_id into new_id;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(sora_v2.current_user_id(),'QUEST_DRAFT_CREATED',jsonb_build_object('quest_id',new_id,'source',p_source)::text);
  return new_id;
end; $$;

create or replace function sora_v2.admin_review_quest(p_quest_id integer,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare quest sora_v2.quests%rowtype; parameters jsonb; capacity integer; target integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_decision not in ('VERIFIED','REJECTED') then raise exception 'Review decision must be VERIFIED or REJECTED'; end if;
  select * into quest from sora_v2.quests where quest_id=p_quest_id for update;
  if quest.quest_id is null then raise exception 'Quest not found'; end if;
  if exists(select 1 from sora_v2.user_quests where quest_id=p_quest_id and quest_status='IN PROGRESS') and p_decision='REJECTED' then raise exception 'An assigned quest cannot be rejected'; end if;
  parameters:=coalesce(quest.revised_parameters::jsonb,quest.previous_parameters::jsonb,'{}'::jsonb);
  target:=greatest(1,coalesce((parameters->>'target_value')::integer,1));
  capacity:=sora_v2.quest_catalog_capacity(quest.target_genre);
  if p_decision='VERIFIED' and coalesce(parameters->>'objective_type','BOOKS_READ')='BOOKS_READ' and capacity<target then raise exception 'Quest is no longer feasible for the current catalog'; end if;
  parameters:=parameters||jsonb_build_object('generation_status',case when p_decision='VERIFIED' then 'APPROVED' else 'DISCARDED' end,
    'review_note',left(coalesce(p_note,''),1000),'reviewed_at',now(),'catalog_capacity',capacity);
  update sora_v2.quests set review_decision=p_decision,reviewed_by=sora_v2.current_user_id(),revised_parameters=parameters::json,updated_at=now() where quest_id=p_quest_id;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(sora_v2.current_user_id(),'QUEST_REVIEWED',jsonb_build_object('quest_id',p_quest_id,'decision',p_decision)::text);
end; $$;

create or replace function sora_v2.admin_update_quest_draft(
  p_quest_id integer,p_name text,p_difficulty text,p_description text,p_target_value integer,p_points integer,p_days integer,p_target_genre text,p_feedback text
) returns void language plpgsql security definer set search_path='' as $$
declare quest sora_v2.quests%rowtype; parameters jsonb; min_target integer; max_target integer; min_points integer; max_points integer; capacity integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select * into quest from sora_v2.quests where quest_id=p_quest_id for update;
  if quest.quest_id is null or quest.review_decision<>'PENDING' then raise exception 'Only pending quest drafts can be edited'; end if;
  min_target:=case p_difficulty when 'Easy' then 1 when 'Medium' then 2 when 'Hard' then 3 end;
  max_target:=case p_difficulty when 'Easy' then 2 when 'Medium' then 3 when 'Hard' then 5 end;
  min_points:=case p_difficulty when 'Easy' then 30 when 'Medium' then 80 when 'Hard' then 150 end;
  max_points:=case p_difficulty when 'Easy' then 80 when 'Medium' then 160 when 'Hard' then 300 end;
  capacity:=sora_v2.quest_catalog_capacity(p_target_genre);
  if min_target is null or p_target_value not between min_target and max_target or p_points not between min_points and max_points or p_days not between 1 and 90
    or capacity<p_target_value or length(btrim(p_name))<3 or length(btrim(p_description))<10 or length(btrim(p_feedback))<3
  then raise exception 'Refinement is outside configured rules or current catalog capacity'; end if;
  parameters:=coalesce(quest.revised_parameters::jsonb,quest.previous_parameters::jsonb,'{}'::jsonb)||jsonb_build_object(
    'target_value',p_target_value,'generation_status','REFINED','catalog_capacity',capacity,'feedback',left(btrim(p_feedback),1000),'refined_at',now());
  update sora_v2.quests set previous_parameters=coalesce(revised_parameters,previous_parameters),revised_parameters=parameters::json,
    quest_name=left(btrim(p_name),255),quest_difficulty=p_difficulty,quest_description=left(btrim(p_description),255),quest_requirement=left(btrim(p_description),255),
    target_genre=nullif(btrim(p_target_genre),''),points_reward=p_points,time_limit_days=p_days,updated_at=now() where quest_id=p_quest_id;
end; $$;

create or replace function sora_v2.reader_redeem_reward(p_reward_id integer)
returns integer language plpgsql security definer set search_path='' as $$
declare reader_id uuid:=sora_v2.current_user_id(); reward sora_v2.rewards%rowtype; balance integer; redemption integer;
begin
  if reader_id is null or not exists(select 1 from sora_v2.users where id=reader_id and user_role='Reader' and is_active) then raise exception 'Active reader sign-in required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(reader_id::text,0));
  select * into reward from sora_v2.rewards where reward_id=p_reward_id for update;
  if reward.reward_id is null or not reward.is_available or reward.stock_quantity<1 then raise exception 'Reward is unavailable'; end if;
  select coalesce(sum(points_awarded),0)::integer-coalesce((select sum(points_spent) from sora_v2.redemptions where user_id=reader_id and redemption_status<>'CANCELLED'),0)::integer into balance from sora_v2.user_quests where user_id=reader_id;
  if balance<reward.points_cost then raise exception 'Not enough quest points'; end if;
  insert into sora_v2.redemptions(user_id,reward_id,points_spent,redemption_status) values(reader_id,p_reward_id,reward.points_cost,'PENDING') returning redemption_id into redemption;
  update sora_v2.rewards set stock_quantity=stock_quantity-1,is_available=stock_quantity-1>0 where reward_id=p_reward_id;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(reader_id,'REWARD_REDEEMED',jsonb_build_object('redemption_id',redemption,'reward_id',p_reward_id,'points_spent',reward.points_cost)::text);
  return redemption;
end; $$;

revoke all on function sora_v2.quest_catalog_capacity(text),sora_v2.admin_create_quest_draft(text,text,text,text,integer,integer,integer,text,text,text,text),sora_v2.admin_review_quest(integer,text,text),sora_v2.admin_update_quest_draft(integer,text,text,text,integer,integer,integer,text,text),sora_v2.reader_redeem_reward(integer) from public,anon,authenticated;
grant execute on function sora_v2.admin_create_quest_draft(text,text,text,text,integer,integer,integer,text,text,text,text),sora_v2.admin_review_quest(integer,text,text),sora_v2.admin_update_quest_draft(integer,text,text,text,integer,integer,integer,text,text) to authenticated;
grant execute on function sora_v2.reader_redeem_reward(integer) to authenticated;

commit;
