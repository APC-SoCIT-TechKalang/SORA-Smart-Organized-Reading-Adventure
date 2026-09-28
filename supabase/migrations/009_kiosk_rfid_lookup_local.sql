-- Local RFID prototype. This returns a limited kiosk snapshot for a validated
-- card. It does not create a Supabase Auth session yet.
create or replace function public.kiosk_rfid_lookup(p_rfid_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'status', 'approved',
    'profile', jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name),
    'membership', jsonb_build_object('number', m.membership_number, 'status', m.status, 'expires_at', m.expires_at, 'remaining_minutes', m.remaining_minutes),
    'progress', jsonb_build_object('points', coalesce(rp.total_points, 0), 'streak', coalesce(rp.current_streak_days, 0), 'rank', coalesce(mr.name, 'F')),
    'reading_sessions', (select count(*) from public.reading_logs l where l.user_id = p.user_id)
  ) into result
  from public.library_cards c
  join public.profiles p on p.user_id = c.user_id and p.is_active = true
  join public.memberships m on m.user_id = c.user_id and m.status = 'ACTIVE' and (m.expires_at is null or m.expires_at > now())
  left join public.reader_progress rp on rp.user_id = c.user_id
  left join public.membership_ranks mr on mr.rank_id = rp.rank_id
  where upper(regexp_replace(coalesce(c.rfid_uid, ''), '[^0-9A-Za-z]', '', 'g')) = upper(regexp_replace(trim(p_rfid_uid), '[^0-9A-Za-z]', '', 'g'))
    and c.status = 'ACTIVE'
  limit 1;

  return coalesce(result, jsonb_build_object('status', 'not_found'));
end;
$$;

revoke all on function public.kiosk_rfid_lookup(text) from public, anon, authenticated;
grant execute on function public.kiosk_rfid_lookup(text) to anon, authenticated;
