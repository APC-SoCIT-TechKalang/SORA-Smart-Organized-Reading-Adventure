-- Automatic check-in/check-out for both Digital ID QR and physical RFID cards.
-- Apply after 034_reader_station_scan_guard.sql.
begin;

do $$
begin
  if to_regprocedure('sora_v2.admin_reader_station_inspect(text)') is null
     or to_regprocedure('sora_v2.admin_reader_station_complete_checkout(text,integer)') is null then
    raise exception 'Apply 033_admin_reader_station.sql before this migration';
  end if;
end;
$$;

-- Keep only a one-second transactional anti-bounce guard. There is no minimum
-- visit duration: removing and intentionally presenting the card again checks
-- the reader out immediately.
create or replace function sora_v2.guard_reader_station_scan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  latest record;
  elapsed_seconds numeric;
  duplicate_seconds integer := 1;
begin
  if new.action not in ('CHECKIN_APPROVED', 'CHECKIN_ENDED', 'CHECKOUT_COMPLETED') then return new; end if;
  if not sora_v2.is_librarian() then return new; end if;

  perform 1 from sora_v2.users where id = new.user_id for update;
  if not found then raise exception 'Reader not found'; end if;

  select action, created_at into latest
  from sora_v2.session_activity_logs
  where user_id = new.user_id
    and action in ('CHECKIN_APPROVED', 'CHECKIN_ENDED', 'CHECKOUT_COMPLETED')
  order by log_id desc
  limit 1;

  if latest is null then return new; end if;
  elapsed_seconds := extract(epoch from (now() - latest.created_at));
  if elapsed_seconds < duplicate_seconds then
    raise exception 'Duplicate scan ignored. Remove the card briefly, then scan it again';
  end if;
  return new;
end;
$$;

-- One atomic entry point for Digital ID and physical RFID scans. The frontend
-- resolves either credential to the registered RFID UID; this function decides
-- the correct action from the shared attendance state and records it.
create or replace function sora_v2.admin_reader_station_scan(p_rfid text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inspection jsonb;
  checkout_result jsonb;
  scan_action text;
  occurred_at timestamptz := clock_timestamp();
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;

  inspection := sora_v2.admin_reader_station_inspect(p_rfid);
  scan_action := inspection ->> 'action';

  if scan_action = 'CHECKIN' then
    perform sora_v2.approve_kiosk_checkin(p_rfid);
  elsif scan_action = 'CHECKOUT' then
    checkout_result := sora_v2.admin_reader_station_complete_checkout(
      p_rfid,
      nullif(inspection ->> 'session_id', '')::integer
    );
  else
    raise exception 'Unable to determine the attendance action';
  end if;

  return inspection || jsonb_build_object(
    'action', scan_action,
    'occurred_at', occurred_at,
    'minutes', coalesce((checkout_result ->> 'minutes')::integer, (inspection ->> 'minutes')::integer),
    'checkin_only', coalesce((checkout_result ->> 'checkin_only')::boolean, false)
  );
end;
$$;

revoke all on function sora_v2.admin_reader_station_scan(text) from public, anon, authenticated;
grant execute on function sora_v2.admin_reader_station_scan(text) to authenticated;

notify pgrst, 'reload schema';
commit;
