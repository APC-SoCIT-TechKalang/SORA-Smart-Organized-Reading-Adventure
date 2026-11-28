-- Apply after 035. Preserve the balance after checkout, not today's balance.
begin;
alter table sora_v2.sessions
  add column if not exists remaining_minutes_after integer check (remaining_minutes_after >= 0),
  add column if not exists unlimited_time_after boolean;

create or replace function sora_v2.capture_session_time_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Deferred until commit: supported checkout routines debit the reader either
  -- before or after updating return_date. Never deduct time in this trigger.
  update sora_v2.sessions s
  set remaining_minutes_after = u.remaining_minutes,
      unlimited_time_after = (u.membership_type = 'Guild Adventurer')
  from sora_v2.users u
  where s.session_id = new.session_id and u.id = s.user_id
    and s.remaining_minutes_after is null and s.unlimited_time_after is null;
  return null;
end;
$$;
revoke all on function sora_v2.capture_session_time_balance() from public, anon, authenticated;
drop trigger if exists capture_session_time_balance on sora_v2.sessions;
create constraint trigger capture_session_time_balance
  after update on sora_v2.sessions deferrable initially deferred
  for each row when (old.return_date is null and new.return_date is not null)
  execute function sora_v2.capture_session_time_balance();

-- Historical balances cannot be reconstructed reliably after top-ups and
-- membership edits, so existing completed sessions intentionally stay null.
notify pgrst, 'reload schema';
commit;
