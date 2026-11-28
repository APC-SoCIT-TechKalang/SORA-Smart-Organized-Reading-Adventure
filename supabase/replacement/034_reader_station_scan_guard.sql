-- Apply after 033_admin_reader_station.sql. Reuses attendance activity logs.
begin;

create or replace function sora_v2.guard_reader_station_scan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare latest record; elapsed_seconds numeric;
  duplicate_seconds integer := coalesce(nullif(current_setting('sora.reader_station_duplicate_seconds', true), '')::integer, 5);
  checkout_seconds integer := coalesce(nullif(current_setting('sora.reader_station_min_checkout_seconds', true), '')::integer, 30);
begin
  if new.action not in ('CHECKIN_APPROVED', 'CHECKIN_ENDED', 'CHECKOUT_COMPLETED') then return new; end if;
  if not sora_v2.is_librarian() then return new; end if;
  duplicate_seconds := greatest(1, duplicate_seconds);
  checkout_seconds := greatest(duplicate_seconds, checkout_seconds);
  -- Lock the reader row so simultaneous scans of one card serialize, while
  -- other readers can continue scanning independently.
  perform 1 from sora_v2.users where id = new.user_id for update;
  if not found then raise exception 'Reader not found'; end if;
  select action, created_at into latest from sora_v2.session_activity_logs
    where user_id = new.user_id and action in ('CHECKIN_APPROVED','CHECKIN_ENDED','CHECKOUT_COMPLETED')
    order by log_id desc limit 1;
  if latest is null then return new; end if;
  elapsed_seconds := extract(epoch from (now() - latest.created_at));
  if new.action = 'CHECKIN_APPROVED' and elapsed_seconds < duplicate_seconds then
    raise exception 'Duplicate scan ignored. Wait five seconds before scanning this card again';
  end if;
  if new.action in ('CHECKIN_ENDED','CHECKOUT_COMPLETED') and latest.action = 'CHECKIN_APPROVED'
     and elapsed_seconds < duplicate_seconds then
    raise exception 'Duplicate scan ignored. Wait five seconds before checking out';
  end if;
  if new.action in ('CHECKIN_ENDED','CHECKOUT_COMPLETED') and latest.action = 'CHECKIN_APPROVED'
     and elapsed_seconds < checkout_seconds
     and current_setting('sora.reader_station_checkout_override', true) is distinct from 'on' then
    raise exception 'Recent check-in. Wait % seconds before check-out or use the librarian override', checkout_seconds;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_reader_station_scan on sora_v2.session_activity_logs;
create trigger guard_reader_station_scan before insert on sora_v2.session_activity_logs
for each row execute function sora_v2.guard_reader_station_scan();

create or replace function sora_v2.admin_reader_station_override_checkout(p_rfid text, p_session_id integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  perform set_config('sora.reader_station_checkout_override', 'on', true);
  result := sora_v2.admin_reader_station_complete_checkout(p_rfid, p_session_id);
  perform set_config('sora.reader_station_checkout_override', 'off', true);
  return result;
end;
$$;
revoke all on function sora_v2.admin_reader_station_override_checkout(text,integer) from public,anon,authenticated;
grant execute on function sora_v2.admin_reader_station_override_checkout(text,integer) to authenticated;
commit;
