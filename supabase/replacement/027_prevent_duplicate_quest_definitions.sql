-- Prevent new duplicate quest definitions while retaining valid historical rows.
begin;

create or replace function sora_v2.ensure_reader_quest()
returns integer language plpgsql security definer set search_path='' as $$
declare reader_id uuid:=sora_v2.current_user_id(); existing integer; selected record; new_quest integer; assignment integer; balance integer; allowed text; parameters jsonb;
begin
  if reader_id is null then raise exception 'Reader sign-in required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(reader_id::text,0));
  update sora_v2.user_quests set quest_status='EXPIRED' where user_id=reader_id and quest_status='IN PROGRESS' and deadline_at<now();
  select user_quest_id into existing from sora_v2.user_quests where user_id=reader_id and quest_status='IN PROGRESS' limit 1;
  if existing is not null then return existing; end if;
  select coalesce(sum(points_awarded),0)::integer into balance from sora_v2.user_quests where user_id=reader_id;
  allowed:=sora_v2.quest_allowed_difficulty(balance);
  select q.*,coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb) parameters into selected from sora_v2.quests q where q.review_decision='VERIFIED' and case allowed when 'Easy' then q.quest_difficulty='Easy' when 'Medium' then q.quest_difficulty in ('Easy','Medium') else q.quest_difficulty in ('Easy','Medium','Hard') end and not exists(select 1 from sora_v2.user_quests prior where prior.user_id=reader_id and prior.quest_id=q.quest_id) order by case when coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb)->>'source'='AI' then 0 else 1 end,q.updated_at desc limit 1;
  if selected.quest_id is null then
    -- Reuse one shared fallback definition. Repeated assignments belong in
    -- user_quests; they must not create duplicate catalogue definitions.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sora_v2:opening-chapter',0));
    select q.quest_id into new_quest from sora_v2.quests q where lower(btrim(q.quest_name))='opening chapter' and q.quest_difficulty='Easy' and q.review_decision='VERIFIED' order by q.quest_id limit 1;
    if new_quest is null then
      parameters:=jsonb_build_object('objective_type','BOOKS_READ','target_value',1,'minimum_session_minutes',5,'source','TEMPLATE','generation_status','READY');
      insert into sora_v2.quests(quest_name,quest_difficulty,quest_description,quest_requirement,time_limit_days,points_reward,review_decision,revised_parameters) values('Opening Chapter','Easy','Finish one verified physical book.','Finish one verified physical book after at least five reading minutes.',7,50,'VERIFIED',parameters::json) returning quest_id into new_quest;
    end if;
    select q.*,coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb) parameters into selected from sora_v2.quests q where q.quest_id=new_quest;
  else new_quest:=selected.quest_id; end if;
  insert into sora_v2.user_quests(user_id,quest_id,deadline_at) values(reader_id,new_quest,now()+make_interval(days=>coalesce(selected.time_limit_days,7))) returning user_quest_id into assignment;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(reader_id,'QUEST_ASSIGNED',jsonb_build_object('user_quest_id',assignment,'quest_id',new_quest)::text);
  return assignment;
end; $$;

create or replace function sora_v2.admin_create_quest_draft(
  p_name text,p_difficulty text,p_description text,p_objective_type text,
  p_target_value integer,p_points integer,p_days integer,p_target_genre text,
  p_source text,p_feasibility text default null,p_feedback_context text default null
) returns integer language plpgsql security definer set search_path='' as $$
declare new_id integer; min_target integer; max_target integer; min_points integer; max_points integer; min_minutes integer; capacity integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if exists(select 1 from sora_v2.quests q where lower(btrim(q.quest_name))=lower(btrim(p_name)) and q.quest_difficulty=p_difficulty and coalesce(lower(btrim(q.target_genre)),'')=coalesce(lower(btrim(p_target_genre)),'') and q.review_decision in ('PENDING','VERIFIED')) then raise exception 'An active or pending quest with the same name, difficulty, and genre already exists'; end if;
  select case p_difficulty when 'Easy' then 1 when 'Medium' then 2 when 'Hard' then 3 end,case p_difficulty when 'Easy' then 2 when 'Medium' then 3 when 'Hard' then 5 end,case p_difficulty when 'Easy' then 30 when 'Medium' then 80 when 'Hard' then 150 end,case p_difficulty when 'Easy' then 80 when 'Medium' then 160 when 'Hard' then 300 end,case p_difficulty when 'Easy' then 5 when 'Medium' then 10 when 'Hard' then 15 end into min_target,max_target,min_points,max_points,min_minutes;
  capacity:=sora_v2.quest_catalog_capacity(p_target_genre);
  if min_target is null or p_objective_type not in ('BOOKS_READ','READING_MINUTES') or p_target_value not between min_target and (case when p_objective_type='READING_MINUTES' then 10000 else max_target end) or p_points not between min_points and max_points or p_days not between 1 and 90 or p_source not in ('AI','TEMPLATE','MANUAL') or length(btrim(p_name))<3 or length(btrim(p_description))<10 or (p_objective_type='BOOKS_READ' and capacity<p_target_value) then raise exception 'Quest is outside configured rules or current catalog capacity'; end if;
  insert into sora_v2.quests(quest_name,quest_difficulty,quest_description,quest_requirement,target_genre,time_limit_days,points_reward,review_decision,revised_parameters) values(left(btrim(p_name),255),p_difficulty,left(btrim(p_description),255),left(btrim(p_description),255),nullif(btrim(p_target_genre),''),p_days,p_points,'PENDING',jsonb_build_object('objective_type',p_objective_type,'target_value',p_target_value,'minimum_session_minutes',min_minutes,'source',p_source,'generation_status','AWAITING_REVIEW','catalog_capacity',capacity,'feasibility',left(coalesce(p_feasibility,''),500),'feedback_context',left(coalesce(p_feedback_context,''),1000))::json) returning quest_id into new_id;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(sora_v2.current_user_id(),'QUEST_DRAFT_CREATED',jsonb_build_object('quest_id',new_id,'source',p_source)::text);
  return new_id;
end; $$;

revoke all on function sora_v2.ensure_reader_quest(),sora_v2.admin_create_quest_draft(text,text,text,text,integer,integer,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function sora_v2.ensure_reader_quest() to authenticated;
grant execute on function sora_v2.admin_create_quest_draft(text,text,text,text,integer,integer,integer,text,text,text,text) to authenticated;
commit;
