-- Supabase Auth mapping, RLS, and AI-request guardrails.
begin;

create function sora_v2.current_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is not null
      and (auth.jwt() -> 'app_metadata' ->> 'sora_user_id')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (auth.jwt() -> 'app_metadata' ->> 'sora_user_id')::uuid
    else null
  end;
$$;

create function sora_v2.is_librarian()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from sora_v2.users u
    where u.id = sora_v2.current_user_id()
      and u.user_role = 'Librarian'
      and u.is_active
  );
$$;

create function sora_v2.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from sora_v2.users u
    where u.id = sora_v2.current_user_id() and u.is_active
  );
$$;

create function sora_v2.ai_prompt_rejection_reason(p_prompt text)
returns text language plpgsql immutable set search_path = '' as $$
declare normalized text := lower(coalesce(btrim(p_prompt), ''));
begin
  if char_length(normalized) < 2 then return 'Request is empty or too short'; end if;
  if char_length(normalized) > 500 then return 'Request exceeds 500 characters'; end if;
  if normalized ~ '(ignore (all |the )?(previous|system)|system prompt|developer message|jailbreak|bypass (the )?(rules|guardrails)|api[_ -]?key|service[_ -]?role|password|drop table|delete from|alter table)' then
    return 'Request contains unsafe instructions or secret-access attempts';
  end if;
  if normalized ~ '(explicit sexual|porn|nude|rape|how to kill|make a bomb|self[ -]?harm|suicide instructions)' then
    return 'Request contains inappropriate or harmful content';
  end if;
  if normalized !~ '(book|manga|novel|read|reading|author|genre|catalog|library|shelf|available|recommend|quest|reward|progress|account|membership|rank|points|sora|bon|hello|hi|help|thank)' then
    return 'Request is unrelated to the library system';
  end if;
  return null;
end;
$$;

create function sora_v2.record_ai_request(
  p_prompt text, p_category text default 'GENERAL_LIBRARY'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reader_id uuid := sora_v2.current_user_id();
  reason text;
  new_request_id uuid;
begin
  if reader_id is null then raise exception 'Sign in to use BON'; end if;
  if not exists (select 1 from sora_v2.users where id = reader_id and is_active) then
    raise exception 'Active user account required';
  end if;
  if p_category not in ('CATALOG', 'RECOMMENDATION', 'ACCOUNT_HELP',
      'QUEST_HELP', 'GENERAL_LIBRARY') then
    raise exception 'Invalid AI request category';
  end if;
  reason := sora_v2.ai_prompt_rejection_reason(p_prompt);
  insert into sora_v2.ai_requests(user_id, request_prompt, request_category,
    validation_status, rejection_reason)
  values (reader_id, left(btrim(p_prompt), 2000), p_category,
    case when reason is null then 'ALLOWED' else 'REJECTED' end, reason)
  returning request_id into new_request_id;
  return jsonb_build_object('request_id', new_request_id,
    'status', case when reason is null then 'ALLOWED' else 'REJECTED' end,
    'reason', reason);
end;
$$;

create function sora_v2.complete_ai_request(
  p_request_id uuid, p_response_text text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update sora_v2.ai_requests
  set response_text = left(p_response_text, 4000), completed_at = now()
  where request_id = p_request_id
    and user_id = sora_v2.current_user_id()
    and validation_status = 'ALLOWED';
  if not found then raise exception 'AI request not found or not allowed'; end if;
end;
$$;

revoke all on function sora_v2.current_user_id() from public, anon, authenticated;
revoke all on function sora_v2.is_librarian() from public, anon, authenticated;
revoke all on function sora_v2.is_active_user() from public, anon, authenticated;
revoke all on function sora_v2.ai_prompt_rejection_reason(text) from public, anon, authenticated;
revoke all on function sora_v2.record_ai_request(text,text) from public, anon, authenticated;
revoke all on function sora_v2.complete_ai_request(uuid,text) from public, anon, authenticated;
grant execute on function sora_v2.current_user_id() to authenticated;
grant execute on function sora_v2.is_librarian() to authenticated;
grant execute on function sora_v2.is_active_user() to authenticated;
grant execute on function sora_v2.record_ai_request(text,text) to authenticated;
grant execute on function sora_v2.complete_ai_request(uuid,text) to authenticated;

grant usage on schema sora_v2 to anon, authenticated, service_role;
grant all on all tables in schema sora_v2 to service_role;
grant all on all sequences in schema sora_v2 to service_role;
grant execute on all functions in schema sora_v2 to service_role;
grant select on sora_v2.authors, sora_v2.books to anon;
grant select on all tables in schema sora_v2 to authenticated;
grant update (first_name, middle_name, last_name, birthdate, mobile_number)
  on sora_v2.users to authenticated;

create policy "catalog authors are visible"
  on sora_v2.authors for select to anon, authenticated using (true);
create policy "catalog books are visible"
  on sora_v2.books for select to anon, authenticated using (true);
create policy "active users see copies"
  on sora_v2.book_copies for select to authenticated
  using (sora_v2.is_active_user());
create policy "active users see seats"
  on sora_v2.seats for select to authenticated
  using (sora_v2.is_active_user());
create policy "active users see rewards"
  on sora_v2.rewards for select to authenticated
  using (sora_v2.is_active_user());
create policy "active users see quests"
  on sora_v2.quests for select to authenticated
  using (sora_v2.is_active_user());

create policy "users read their own record and librarians read all"
  on sora_v2.users for select to authenticated
  using (id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "active users edit their own permitted fields"
  on sora_v2.users for update to authenticated
  using (id = sora_v2.current_user_id() and is_active)
  with check (id = sora_v2.current_user_id() and is_active);
create policy "cards are private"
  on sora_v2.librarycard for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "topups are staff only"
  on sora_v2.topup_transactions for select to authenticated
  using (sora_v2.is_librarian());
create policy "sessions are private"
  on sora_v2.sessions for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "activity logs are staff only"
  on sora_v2.session_activity_logs for select to authenticated
  using (sora_v2.is_librarian());
create policy "user quests are private"
  on sora_v2.user_quests for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "redemptions are private"
  on sora_v2.redemptions for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "AI requests are private"
  on sora_v2.ai_requests for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "rank history is private"
  on sora_v2.rank_history for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());

commit;
