-- RFID resolution for the kiosk. This function is intentionally service-role
-- only: a browser must never enumerate library-card credentials or profiles.
create or replace function public.resolve_kiosk_rfid(p_rfid_uid text)
returns table (user_id uuid, card_id bigint, email text, first_name text, last_name text, membership_number text, expires_at timestamptz, total_points integer, current_streak_days integer, reading_sessions bigint)
language sql security definer set search_path = public, auth as $$
  select p.user_id, c.card_id, u.email, p.first_name, p.last_name,
    m.membership_number, m.expires_at, coalesce(rp.total_points, 0),
    coalesce(rp.current_streak_days, 0),
    (select count(*) from public.reading_logs rl where rl.user_id = p.user_id)
  from public.library_cards c
  join public.profiles p on p.user_id = c.user_id and p.is_active = true
  join public.memberships m on m.user_id = c.user_id and m.status = 'ACTIVE'
    and (m.expires_at is null or m.expires_at > now())
  join auth.users u on u.id = p.user_id
  left join public.reader_progress rp on rp.user_id = p.user_id
  where c.status = 'ACTIVE' and c.rfid_uid is not null
    and upper(regexp_replace(c.rfid_uid, '[^a-zA-Z0-9]', '', 'g')) = upper(regexp_replace(coalesce(p_rfid_uid, ''), '[^a-zA-Z0-9]', '', 'g'))
  order by c.issued_at desc limit 1;
$$;
revoke all on function public.resolve_kiosk_rfid(text) from public, anon, authenticated;
grant execute on function public.resolve_kiosk_rfid(text) to service_role;
-- Supersede the prototype anonymous profile lookup.
revoke all on function public.kiosk_rfid_lookup(text) from public, anon, authenticated;
