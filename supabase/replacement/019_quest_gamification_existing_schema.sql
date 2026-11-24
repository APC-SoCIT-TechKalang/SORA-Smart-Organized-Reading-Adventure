-- Quest gamification using only the adviser-approved tables from 001_schema.sql.
-- Apply after 018_per_book_returns_checkout.sql.
-- Adds no tables and no columns. Existing rows are preserved.
begin;

create index if not exists quest_activity_audit_idx
  on sora_v2.session_activity_logs(user_id,action,created_at desc);

-- Points remain authoritative in existing user_quests and redemptions.
create or replace function sora_v2.points_balance()
returns integer language sql stable security definer set search_path='' as $$
  select coalesce((select sum(points_awarded) from sora_v2.user_quests where user_id=sora_v2.current_user_id()),0)::integer
    - coalesce((select sum(points_spent) from sora_v2.redemptions where user_id=sora_v2.current_user_id() and redemption_status<>'CANCELLED'),0)::integer;
$$;

create or replace function sora_v2.quest_rank_name(p_points integer)
returns text language sql immutable set search_path='' as $$
  select case when p_points>=1500 then 'Master Archivist' when p_points>=750 then 'Shelf Adventurer'
    when p_points>=250 then 'Story Seeker' else 'Novice Reader' end;
$$;

create or replace function sora_v2.quest_allowed_difficulty(p_points integer)
returns text language sql immutable set search_path='' as $$
  select case when p_points>=750 then 'Hard' when p_points>=250 then 'Medium' else 'Easy' end;
$$;

create or replace function sora_v2.complete_quest_atomic(p_user_quest_id integer)
returns void language plpgsql security definer set search_path='' as $$
declare assignment sora_v2.user_quests%rowtype; reward integer; balance integer; old_rank text; v_new_rank text;
begin
  select * into assignment from sora_v2.user_quests where user_quest_id=p_user_quest_id for update;
  if assignment.quest_status<>'IN PROGRESS' then return; end if;
  select points_reward into reward from sora_v2.quests where quest_id=assignment.quest_id;
  update sora_v2.user_quests set quest_status='COMPLETED',completed_at=now(),points_awarded=reward where user_quest_id=p_user_quest_id;
  insert into sora_v2.session_activity_logs(user_id,action,details)
    values(assignment.user_id,'QUEST_COMPLETED',jsonb_build_object('user_quest_id',p_user_quest_id,'quest_id',assignment.quest_id,'points_awarded',reward)::text);
  select coalesce(sum(points_awarded),0)::integer into balance from sora_v2.user_quests where user_id=assignment.user_id;
  select rh.new_rank into old_rank from sora_v2.rank_history rh where rh.user_id=assignment.user_id order by rh.changed_at desc,rh.rank_id desc limit 1;
  old_rank:=coalesce(old_rank,'Novice Reader'); v_new_rank:=sora_v2.quest_rank_name(balance);
  if old_rank is distinct from v_new_rank then insert into sora_v2.rank_history(user_id,previous_rank,new_rank) values(assignment.user_id,old_rank,v_new_rank); end if;
end; $$;

-- A scan by itself never advances a quest. Only the verified return event does.
create or replace function sora_v2.process_quest_activity_existing_schema()
returns trigger language plpgsql security definer set search_path='' as $$
declare started timestamptz; minutes integer; genre text; assignment record; parameters jsonb; objective text; target integer; minimum_minutes integer; delta integer;
begin
  if new.action not in ('KIOSK_BOOK_RETURNED','READING_FINISHED') or new.user_id is null or new.copy_id is null or new.session_id is null then return new; end if;
  select coalesce((select min(created_at) from sora_v2.session_activity_logs where session_id=new.session_id and copy_id=new.copy_id and action in ('KIOSK_BOOK_SCANNED','READING_STARTED')),
    (select borrow_date from sora_v2.sessions where session_id=new.session_id)) into started;
  minutes:=greatest(0,floor(extract(epoch from(new.created_at-started))/60)::integer);
  select b.book_genre into genre from sora_v2.book_copies c join sora_v2.books b on b.book_id=c.book_id where c.copy_id=new.copy_id;
  update sora_v2.user_quests set quest_status='EXPIRED' where user_id=new.user_id and quest_status='IN PROGRESS' and deadline_at<new.created_at;
  for assignment in select uq.user_quest_id,uq.progress_value,q.quest_id,q.target_genre,q.revised_parameters,q.previous_parameters
    from sora_v2.user_quests uq join sora_v2.quests q on q.quest_id=uq.quest_id
    where uq.user_id=new.user_id and uq.quest_status='IN PROGRESS' and (uq.deadline_at is null or uq.deadline_at>=new.created_at)
      and (q.target_genre is null or lower(q.target_genre)=lower(genre)) for update of uq loop
    parameters:=coalesce(assignment.revised_parameters::jsonb,assignment.previous_parameters::jsonb,'{}'::jsonb);
    objective:=coalesce(parameters->>'objective_type','BOOKS_READ');
    target:=greatest(1,coalesce((parameters->>'target_value')::integer,1));
    minimum_minutes:=greatest(1,coalesce((parameters->>'minimum_session_minutes')::integer,5));
    if minutes<minimum_minutes then continue; end if;
    if exists(select 1 from sora_v2.session_activity_logs l where l.user_id=new.user_id and l.action='QUEST_PROGRESS_RECORDED'
      and (l.details::jsonb->>'user_quest_id')::integer=assignment.user_quest_id and (l.details::jsonb->>'copy_id')::integer=new.copy_id) then continue; end if;
    delta:=case when objective='READING_MINUTES' then minutes else 1 end;
    update sora_v2.user_quests set progress_value=least(target,progress_value+delta) where user_quest_id=assignment.user_quest_id;
    insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action,details)
      values(new.session_id,new.user_id,new.book_id,new.copy_id,'QUEST_PROGRESS_RECORDED',jsonb_build_object('user_quest_id',assignment.user_quest_id,'copy_id',new.copy_id,'metric',objective,'value',delta)::text);
    if assignment.progress_value+delta>=target then perform sora_v2.complete_quest_atomic(assignment.user_quest_id); end if;
  end loop;
  return new;
end; $$;
drop trigger if exists quest_progress_from_activity on sora_v2.session_activity_logs;
create trigger quest_progress_from_activity after insert on sora_v2.session_activity_logs
for each row execute function sora_v2.process_quest_activity_existing_schema();

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
  select q.*,coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb) parameters into selected
    from sora_v2.quests q where q.review_decision='VERIFIED'
      and case allowed when 'Easy' then q.quest_difficulty='Easy' when 'Medium' then q.quest_difficulty in ('Easy','Medium') else q.quest_difficulty in ('Easy','Medium','Hard') end
      and not exists(select 1 from sora_v2.user_quests prior where prior.user_id=reader_id and prior.quest_id=q.quest_id)
    order by case when coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb)->>'source'='AI' then 0 else 1 end,q.updated_at desc limit 1;
  if selected.quest_id is null then
    parameters:=jsonb_build_object('objective_type','BOOKS_READ','target_value',1,'minimum_session_minutes',5,'source','TEMPLATE','generation_status','READY');
    insert into sora_v2.quests(quest_name,quest_difficulty,quest_description,quest_requirement,time_limit_days,points_reward,review_decision,revised_parameters)
      values('Opening Chapter','Easy','Finish one verified physical book.','Finish one verified physical book after at least five reading minutes.',7,50,'VERIFIED',parameters::json)
      returning quest_id into new_quest;
    select q.*,coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb) parameters into selected from sora_v2.quests q where q.quest_id=new_quest;
  else new_quest:=selected.quest_id; end if;
  insert into sora_v2.user_quests(user_id,quest_id,deadline_at) values(reader_id,new_quest,now()+make_interval(days=>coalesce(selected.time_limit_days,7))) returning user_quest_id into assignment;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(reader_id,'QUEST_ASSIGNED',jsonb_build_object('user_quest_id',assignment,'quest_id',new_quest)::text);
  return assignment;
end; $$;

create or replace function sora_v2.reader_quest_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare reader_id uuid:=sora_v2.current_user_id(); balance integer; rank_name text; next_rank jsonb;
begin
  if reader_id is null then raise exception 'Reader sign-in required'; end if;
  perform sora_v2.ensure_reader_quest();
  select coalesce(sum(points_awarded),0)::integer-coalesce((select sum(points_spent) from sora_v2.redemptions where user_id=reader_id and redemption_status<>'CANCELLED'),0)::integer into balance from sora_v2.user_quests where user_id=reader_id;
  rank_name:=sora_v2.quest_rank_name(balance);
  next_rank:=case when balance<250 then jsonb_build_object('name','Story Seeker','points_required',250) when balance<750 then jsonb_build_object('name','Shelf Adventurer','points_required',750) when balance<1500 then jsonb_build_object('name','Master Archivist','points_required',1500) else null end;
  return (select jsonb_build_object('rank',rank_name,'membership_tier',u.membership_type,'points',balance,'last_updated',now(),'next_rank',next_rank,
    'quests',coalesce((select jsonb_agg(jsonb_build_object('user_quest_id',uq.user_quest_id,'quest_id',q.quest_id,'name',q.quest_name,'description',q.quest_description,'difficulty',q.quest_difficulty,
      'objective_type',coalesce(params->>'objective_type','BOOKS_READ'),'current_value',uq.progress_value,'target_value',greatest(1,coalesce((params->>'target_value')::integer,1)),
      'points',q.points_reward,'status',uq.quest_status,'deadline_at',uq.deadline_at,'completed_at',uq.completed_at,'target_genre',q.target_genre,'source',coalesce(params->>'source','MANUAL')) order by uq.assigned_at desc)
      from sora_v2.user_quests uq join sora_v2.quests q on q.quest_id=uq.quest_id
      cross join lateral (select coalesce(q.revised_parameters::jsonb,q.previous_parameters::jsonb,'{}'::jsonb) params) p where uq.user_id=reader_id),'[]'::jsonb))
    from sora_v2.users u where u.id=reader_id);
end; $$;

create or replace function sora_v2.admin_create_generated_quest(p_name text,p_difficulty text,p_description text,p_objective_type text,p_target_value integer,p_points integer,p_days integer,p_target_genre text,p_source text)
returns integer language plpgsql security definer set search_path='' as $$
declare new_id integer; min_target integer; max_target integer; min_points integer; max_points integer; min_minutes integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select case p_difficulty when 'Easy' then 1 when 'Medium' then 2 when 'Hard' then 3 end,
    case p_difficulty when 'Easy' then 2 when 'Medium' then 3 when 'Hard' then 5 end,
    case p_difficulty when 'Easy' then 30 when 'Medium' then 80 when 'Hard' then 150 end,
    case p_difficulty when 'Easy' then 80 when 'Medium' then 160 when 'Hard' then 300 end,
    case p_difficulty when 'Easy' then 5 when 'Medium' then 10 when 'Hard' then 15 end
    into min_target,max_target,min_points,max_points,min_minutes;
  if min_target is null or p_objective_type not in ('BOOKS_READ','READING_MINUTES') or p_target_value not between min_target and (case when p_objective_type='READING_MINUTES' then 10000 else max_target end)
    or p_points not between min_points and max_points or p_days not between 1 and 90 or p_source not in ('AI','TEMPLATE','MANUAL') then raise exception 'Quest is outside configured rules'; end if;
  insert into sora_v2.quests(quest_name,quest_difficulty,quest_description,quest_requirement,target_genre,time_limit_days,points_reward,reviewed_by,review_decision,revised_parameters)
    values(btrim(p_name),p_difficulty,btrim(p_description),btrim(p_description),nullif(btrim(p_target_genre),''),p_days,p_points,sora_v2.current_user_id(),'VERIFIED',
      jsonb_build_object('objective_type',p_objective_type,'target_value',p_target_value,'minimum_session_minutes',min_minutes,'source',p_source,'generation_status','READY')::json) returning quest_id into new_id;
  return new_id;
end; $$;

create or replace function sora_v2.system_assign_generated_quest(p_user_id uuid,p_name text,p_difficulty text,p_description text,p_target_value integer,p_points integer,p_days integer,p_target_genre text)
returns integer language plpgsql security definer set search_path='' as $$
declare new_quest integer; assignment integer; balance integer; allowed text; min_target integer; max_target integer; min_points integer; max_points integer; min_minutes integer;
begin
  if p_user_id is null or not exists(select 1 from sora_v2.users where id=p_user_id and user_role='Reader' and is_active) then raise exception 'Eligible reader required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  update sora_v2.user_quests set quest_status='EXPIRED' where user_id=p_user_id and quest_status='IN PROGRESS' and deadline_at<now();
  select user_quest_id into assignment from sora_v2.user_quests where user_id=p_user_id and quest_status='IN PROGRESS' limit 1;
  if assignment is not null then return assignment; end if;
  select coalesce(sum(points_awarded),0)::integer into balance from sora_v2.user_quests where user_id=p_user_id; allowed:=sora_v2.quest_allowed_difficulty(balance);
  if (allowed='Easy' and p_difficulty<>'Easy') or (allowed='Medium' and p_difficulty='Hard') then raise exception 'Generated quest is above reader rank'; end if;
  select case p_difficulty when 'Easy' then 1 when 'Medium' then 2 when 'Hard' then 3 end,case p_difficulty when 'Easy' then 2 when 'Medium' then 3 when 'Hard' then 5 end,
    case p_difficulty when 'Easy' then 30 when 'Medium' then 80 when 'Hard' then 150 end,case p_difficulty when 'Easy' then 80 when 'Medium' then 160 when 'Hard' then 300 end,
    case p_difficulty when 'Easy' then 5 when 'Medium' then 10 when 'Hard' then 15 end into min_target,max_target,min_points,max_points,min_minutes;
  if min_target is null or p_target_value not between min_target and max_target or p_points not between min_points and max_points or p_days not between 1 and 90 then raise exception 'Generated quest is outside reader rules'; end if;
  insert into sora_v2.quests(quest_name,quest_difficulty,quest_description,quest_requirement,target_genre,time_limit_days,points_reward,review_decision,revised_parameters)
    values(btrim(p_name),p_difficulty,btrim(p_description),btrim(p_description),nullif(btrim(p_target_genre),''),p_days,p_points,'VERIFIED',jsonb_build_object('objective_type','BOOKS_READ','target_value',p_target_value,'minimum_session_minutes',min_minutes,'source','AI','generation_status','READY')::json)
    returning quest_id into new_quest;
  insert into sora_v2.user_quests(user_id,quest_id,deadline_at) values(p_user_id,new_quest,now()+make_interval(days=>p_days)) returning user_quest_id into assignment;
  insert into sora_v2.session_activity_logs(user_id,action,details) values(p_user_id,'QUEST_ASSIGNED',jsonb_build_object('user_quest_id',assignment,'quest_id',new_quest,'source','AI')::text);
  return assignment;
end; $$;

create or replace function sora_v2.admin_refine_quest(p_quest_id integer,p_target_value integer,p_points integer,p_days integer,p_feedback text)
returns void language plpgsql security definer set search_path='' as $$
declare quest sora_v2.quests%rowtype; parameters jsonb; max_target integer; min_points integer; max_points integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select * into quest from sora_v2.quests where quest_id=p_quest_id for update;
  max_target:=case quest.quest_difficulty when 'Easy' then 2 when 'Medium' then 3 when 'Hard' then 5 end;
  min_points:=case quest.quest_difficulty when 'Easy' then 30 when 'Medium' then 80 when 'Hard' then 150 end;
  max_points:=case quest.quest_difficulty when 'Easy' then 80 when 'Medium' then 160 when 'Hard' then 300 end;
  if quest.quest_id is null or p_target_value not between 1 and max_target or p_points not between min_points and max_points or p_days not between 1 and 90 or length(btrim(p_feedback))<5 then raise exception 'Refinement is outside configured difficulty rules'; end if;
  parameters:=coalesce(quest.revised_parameters::jsonb,quest.previous_parameters::jsonb,'{}'::jsonb)||jsonb_build_object('target_value',p_target_value,'source',coalesce(quest.revised_parameters::jsonb->>'source','MANUAL'),'generation_status','REFINED','feedback',left(btrim(p_feedback),1000));
  update sora_v2.quests set previous_parameters=coalesce(revised_parameters,previous_parameters),revised_parameters=parameters::json,points_reward=p_points,time_limit_days=p_days,reviewed_by=sora_v2.current_user_id(),review_decision='VERIFIED' where quest_id=p_quest_id;
end; $$;

revoke all on function sora_v2.quest_rank_name(integer),sora_v2.quest_allowed_difficulty(integer),sora_v2.complete_quest_atomic(integer),sora_v2.ensure_reader_quest(),sora_v2.reader_quest_dashboard(),sora_v2.admin_create_generated_quest(text,text,text,text,integer,integer,integer,text,text),sora_v2.system_assign_generated_quest(uuid,text,text,text,integer,integer,integer,text),sora_v2.admin_refine_quest(integer,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function sora_v2.ensure_reader_quest(),sora_v2.reader_quest_dashboard() to authenticated;
grant execute on function sora_v2.admin_create_generated_quest(text,text,text,text,integer,integer,integer,text,text),sora_v2.admin_refine_quest(integer,integer,integer,integer,text) to authenticated;
grant execute on function sora_v2.system_assign_generated_quest(uuid,text,text,text,integer,integer,integer,text) to service_role;

commit;
