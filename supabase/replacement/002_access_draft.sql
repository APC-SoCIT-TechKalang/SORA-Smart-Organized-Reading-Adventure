-- Draft access rules for the exact ERD in sora_v2. Do not run this against the
-- current app: no account provisioning or replacement RPCs exist yet.
-- Auth users must receive a server-set app_metadata.sora_user_id claim matching
-- sora_v2.users.user_id. Users cannot set their own app_metadata.
begin;

create function sora_v2.current_user_id()
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is not null
      and (auth.jwt() -> 'app_metadata' ->> 'sora_user_id') ~ '^[0-9]+$'
    then (auth.jwt() -> 'app_metadata' ->> 'sora_user_id')::integer
    else null
  end;
$$;

create function sora_v2.is_librarian()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from sora_v2.users u
    where u.user_id = sora_v2.current_user_id()
      and u.user_role = 'Librarian'
  );
$$;

revoke all on function sora_v2.current_user_id() from public, anon, authenticated;
revoke all on function sora_v2.is_librarian() from public, anon, authenticated;
grant execute on function sora_v2.current_user_id() to authenticated;
grant execute on function sora_v2.is_librarian() to authenticated;

grant usage on schema sora_v2 to anon, authenticated, service_role;
grant all on all tables in schema sora_v2 to service_role;
grant all on all sequences in schema sora_v2 to service_role;
grant execute on all functions in schema sora_v2 to service_role;
grant select on sora_v2.authors, sora_v2.books to anon, authenticated;
grant select on sora_v2.book_copies, sora_v2.memberships,
  sora_v2.librarycard, sora_v2.seats, sora_v2.rewards,
  sora_v2.topup_transactions, sora_v2.sessions,
  sora_v2.session_activity_logs, sora_v2.quests,
  sora_v2.user_quests, sora_v2.redemptions,
  sora_v2.ai_requests, sora_v2.rank_history to authenticated;
grant select (user_id, first_name, middle_name, last_name, username,
  birthdate, user_role, mobile_number) on sora_v2.users to authenticated;
grant update (first_name, middle_name, last_name, birthdate, mobile_number)
  on sora_v2.users to authenticated;

create policy "catalog authors are visible"
  on sora_v2.authors for select to anon, authenticated using (true);
create policy "catalog books are visible"
  on sora_v2.books for select to anon, authenticated using (true);
create policy "readers and librarians see copies"
  on sora_v2.book_copies for select to authenticated
  using (sora_v2.current_user_id() is not null);
create policy "readers and librarians see seats"
  on sora_v2.seats for select to authenticated
  using (sora_v2.current_user_id() is not null);
create policy "readers and librarians see rewards"
  on sora_v2.rewards for select to authenticated
  using (sora_v2.current_user_id() is not null);
create policy "readers and librarians see quests"
  on sora_v2.quests for select to authenticated
  using (sora_v2.current_user_id() is not null);

create policy "users read their own record and librarians read all"
  on sora_v2.users for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
create policy "users edit their own permitted fields"
  on sora_v2.users for update to authenticated
  using (user_id = sora_v2.current_user_id())
  with check (user_id = sora_v2.current_user_id());
create policy "memberships are private"
  on sora_v2.memberships for select to authenticated
  using (user_id = sora_v2.current_user_id() or sora_v2.is_librarian());
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
  using (
    exists (
      select 1 from sora_v2.memberships m
      where m.membership_id = rank_history.membership_id
        and m.user_id = sora_v2.current_user_id()
    ) or sora_v2.is_librarian()
  );

commit;
