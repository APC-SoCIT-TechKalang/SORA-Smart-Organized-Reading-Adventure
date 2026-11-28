-- Apply after 035 (and 036 if using session balance snapshots).
-- Closing a reading session emits CHECKIN_ENDED from release_session_books,
-- then CHECKOUT_COMPLETED from the station RPC in the SAME transaction.
begin;

create or replace function sora_v2.guard_reader_station_scan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare latest record; elapsed_seconds numeric;
begin
  if new.action not in ('CHECKIN_APPROVED', 'CHECKIN_ENDED', 'CHECKOUT_COMPLETED') then return new; end if;
  if not sora_v2.is_librarian() then return new; end if;

  perform 1 from sora_v2.users where id = new.user_id for update;
  if not found then raise exception 'Reader not found'; end if;

  select action, session_id, created_at, xmin::text as transaction_id into latest
    from sora_v2.session_activity_logs
    where user_id = new.user_id
      and action in ('CHECKIN_APPROVED', 'CHECKIN_ENDED', 'CHECKOUT_COMPLETED')
    order by log_id desc limit 1;
  if not found then return new; end if;

  -- These are two audit records for one checkout, not two physical scans.
  -- Require the same transaction AND closed session; an earlier checkout's
  -- event must never exempt a subsequent tap from the one-second guard.
  if new.action = 'CHECKOUT_COMPLETED' and latest.action = 'CHECKIN_ENDED'
     and new.session_id is not null and latest.session_id = new.session_id
     and latest.transaction_id = pg_current_xact_id()::text
     and exists (select 1 from sora_v2.sessions s where s.session_id = new.session_id
       and s.user_id = new.user_id and s.session_status = 'CLOSED') then
    return new;
  end if;

  elapsed_seconds := extract(epoch from (now() - latest.created_at));
  if elapsed_seconds < 1 then
    raise exception 'Duplicate scan ignored. Remove the card briefly, then scan it again';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
