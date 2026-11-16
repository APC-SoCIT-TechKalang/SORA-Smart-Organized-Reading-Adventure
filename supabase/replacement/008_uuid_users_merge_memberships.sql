-- Forward migration for an existing sora_v2 installation.
-- Run during maintenance, then immediately run the updated 002, 003, and 004.
begin;

-- RPCs and policies depend on the columns being replaced. They are recreated
-- by 002-004 after this structural/data migration succeeds.
do $$
declare item record;
begin
  for item in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'sora_v2'
  loop
    execute format('drop policy %I on %I.%I', item.policyname,
      item.schemaname, item.tablename);
  end loop;
  for item in
    select p.oid::regprocedure as identity
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'sora_v2'
  loop
    execute format('drop function %s cascade', item.identity);
  end loop;
end;
$$;

drop table if exists sora_v2._user_id_map_migration;
create table sora_v2._user_id_map_migration (
  old_id integer primary key,
  new_id uuid not null unique default gen_random_uuid()
);
insert into sora_v2._user_id_map_migration(old_id)
select user_id from sora_v2.users;

alter table sora_v2.users
  add column id uuid,
  add column is_active boolean not null default true,
  add column deactivated_at timestamptz,
  add column membership_type text,
  add column membership_rank varchar(50),
  add column membership_status text not null default 'INACTIVE',
  add column remaining_minutes integer not null default 0,
  add column membership_started_at timestamptz,
  add column membership_expires_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

update sora_v2.users u set id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = u.user_id;

with latest as (
  select distinct on (user_id)
    user_id, membership_type, membership_rank, membership_status,
    remaining_minutes, created_at, expires_at
  from sora_v2.memberships
  order by user_id,
    (membership_status = 'ACTIVE' and expires_at > now()) desc,
    created_at desc, membership_id desc
)
update sora_v2.users u
set membership_type = l.membership_type,
    membership_rank = l.membership_rank,
    membership_status = case
      when l.membership_status = 'ACTIVE' and l.expires_at <= now() then 'EXPIRED'
      else l.membership_status end,
    remaining_minutes = greatest(0, l.remaining_minutes),
    membership_started_at = l.created_at,
    membership_expires_at = l.expires_at
from latest l where l.user_id = u.user_id;

alter table sora_v2.librarycard
  add column new_librarycard_id uuid not null default gen_random_uuid(),
  add column new_user_id uuid;
update sora_v2.librarycard c set new_user_id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = c.user_id;

alter table sora_v2.topup_transactions
  add column new_processed_by uuid,
  add column new_user_id uuid;
update sora_v2.topup_transactions t
set new_processed_by = processor.new_id,
    new_user_id = member.new_id
from sora_v2._user_id_map_migration processor,
  sora_v2.memberships old_membership,
  sora_v2._user_id_map_migration member
where processor.old_id = t.processed_by
  and old_membership.membership_id = t.membership_id
  and member.old_id = old_membership.user_id;

alter table sora_v2.sessions add column new_user_id uuid;
update sora_v2.sessions t set new_user_id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = t.user_id;

alter table sora_v2.session_activity_logs add column new_user_id uuid;
update sora_v2.session_activity_logs t set new_user_id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = t.user_id;

alter table sora_v2.quests add column new_reviewed_by uuid;
update sora_v2.quests t set new_reviewed_by = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = t.reviewed_by;

alter table sora_v2.user_quests add column new_user_id uuid;
update sora_v2.user_quests t set new_user_id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = t.user_id;

alter table sora_v2.redemptions add column new_user_id uuid;
update sora_v2.redemptions t set new_user_id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = t.user_id;

alter table sora_v2.ai_requests
  add column new_request_id uuid not null default gen_random_uuid(),
  add column new_user_id uuid,
  add column request_category text not null default 'GENERAL_LIBRARY',
  add column validation_status text not null default 'ALLOWED',
  add column rejection_reason varchar(255),
  add column completed_at timestamptz;
update sora_v2.ai_requests t set new_user_id = m.new_id
from sora_v2._user_id_map_migration m where m.old_id = t.user_id;

alter table sora_v2.rank_history add column new_user_id uuid;
update sora_v2.rank_history h set new_user_id = m.new_id
from sora_v2.memberships old_membership, sora_v2._user_id_map_migration m
where old_membership.membership_id = h.membership_id
  and m.old_id = old_membership.user_id;

-- Keep Supabase Auth mapped to the newly generated database UUIDs.
update auth.users a
set raw_app_meta_data = coalesce(a.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('sora_user_id', m.new_id::text)
from sora_v2._user_id_map_migration m
where a.raw_app_meta_data ->> 'sora_user_id' = m.old_id::text;

-- Replace old keys only after every dependent value has been populated.
alter table sora_v2.librarycard
  drop column librarycard_id cascade,
  drop column user_id cascade;
alter table sora_v2.librarycard rename column new_librarycard_id to librarycard_id;
alter table sora_v2.librarycard rename column new_user_id to user_id;
alter table sora_v2.librarycard
  alter column user_id set not null,
  add primary key (librarycard_id);

alter table sora_v2.topup_transactions
  drop column processed_by cascade,
  drop column membership_id cascade;
alter table sora_v2.topup_transactions rename column new_processed_by to processed_by;
alter table sora_v2.topup_transactions rename column new_user_id to user_id;

alter table sora_v2.sessions drop column user_id cascade;
alter table sora_v2.sessions rename column new_user_id to user_id;
alter table sora_v2.session_activity_logs drop column user_id cascade;
alter table sora_v2.session_activity_logs rename column new_user_id to user_id;
alter table sora_v2.quests drop column reviewed_by cascade;
alter table sora_v2.quests rename column new_reviewed_by to reviewed_by;
alter table sora_v2.user_quests drop column user_id cascade;
alter table sora_v2.user_quests rename column new_user_id to user_id;
alter table sora_v2.redemptions drop column user_id cascade;
alter table sora_v2.redemptions rename column new_user_id to user_id;

alter table sora_v2.ai_requests
  drop column request_id cascade,
  drop column user_id cascade;
alter table sora_v2.ai_requests rename column new_request_id to request_id;
alter table sora_v2.ai_requests rename column new_user_id to user_id;
alter table sora_v2.ai_requests rename column prompt_summary to request_prompt;
alter table sora_v2.ai_requests rename column response_summary to response_text;
update sora_v2.ai_requests
set request_prompt = '[Legacy request unavailable]',
    response_text = null,
    validation_status = 'REJECTED',
    rejection_reason = 'Legacy row did not contain the original AI request';

alter table sora_v2.rank_history drop column membership_id cascade;
alter table sora_v2.rank_history rename column new_user_id to user_id;

drop table sora_v2.memberships cascade;
alter table sora_v2.users drop column user_id cascade;
alter table sora_v2.users alter column id set not null;
alter table sora_v2.users add primary key (id);

alter table sora_v2.librarycard
  add foreign key (user_id) references sora_v2.users(id);

alter table sora_v2.users
  add constraint users_membership_type_check check
    (membership_type in ('Guild Member', 'Guild Adventurer', 'Wanderer')),
  add constraint users_membership_status_check check
    (membership_status in ('INACTIVE', 'ACTIVE', 'EXPIRED', 'SUSPENDED')),
  add constraint users_remaining_minutes_check check (remaining_minutes >= 0),
  add constraint users_deactivation_check check (is_active or deactivated_at is not null),
  add constraint users_active_membership_check check
    (membership_status <> 'ACTIVE' or
      (membership_type is not null and membership_rank is not null
        and membership_expires_at is not null));

alter table sora_v2.topup_transactions
  alter column processed_by set not null,
  alter column user_id set not null,
  add foreign key (processed_by) references sora_v2.users(id),
  add foreign key (user_id) references sora_v2.users(id);
alter table sora_v2.sessions alter column user_id set not null,
  add foreign key (user_id) references sora_v2.users(id);
alter table sora_v2.session_activity_logs
  add foreign key (user_id) references sora_v2.users(id);
alter table sora_v2.quests
  add foreign key (reviewed_by) references sora_v2.users(id);
alter table sora_v2.user_quests alter column user_id set not null,
  add foreign key (user_id) references sora_v2.users(id);
alter table sora_v2.redemptions alter column user_id set not null,
  add foreign key (user_id) references sora_v2.users(id);
alter table sora_v2.ai_requests
  alter column user_id set not null,
  add primary key (request_id),
  add foreign key (user_id) references sora_v2.users(id),
  add constraint ai_requests_category_check check
    (request_category in ('CATALOG', 'RECOMMENDATION', 'ACCOUNT_HELP',
      'QUEST_HELP', 'GENERAL_LIBRARY')),
  add constraint ai_requests_status_check check
    (validation_status in ('PENDING', 'ALLOWED', 'REJECTED')),
  add constraint ai_requests_prompt_length check
    (char_length(btrim(request_prompt)) between 1 and 2000),
  add constraint ai_requests_response_length check
    (response_text is null or char_length(response_text) <= 4000),
  add constraint ai_requests_rejection_check check
    ((validation_status = 'REJECTED' and rejection_reason is not null)
      or (validation_status <> 'REJECTED' and rejection_reason is null));
alter table sora_v2.rank_history alter column user_id set not null,
  add foreign key (user_id) references sora_v2.users(id);

create function sora_v2.touch_updated_at()
returns trigger language plpgsql set search_path = sora_v2 as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger quests_touch_updated_at before update on sora_v2.quests
for each row execute function sora_v2.touch_updated_at();
create trigger users_touch_updated_at before update on sora_v2.users
for each row execute function sora_v2.touch_updated_at();

drop table sora_v2._user_id_map_migration;

commit;

-- Required next: run 002_access_draft.sql, 003_reader_operations_draft.sql,
-- and 004_staff_operations_draft.sql, in that order.
