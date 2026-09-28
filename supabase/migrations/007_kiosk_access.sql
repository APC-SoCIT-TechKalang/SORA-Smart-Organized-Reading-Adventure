-- Temporary staff-assisted kiosk access. RFID will later replace the approval
-- step while keeping the same short-lived kiosk session contract.

create table if not exists public.kiosk_login_requests (
  request_id uuid primary key default gen_random_uuid(),
  request_secret uuid not null default gen_random_uuid(),
  pairing_code text not null,
  device_label text not null default 'Store kiosk',
  requested_at timestamptz not null default now(),
  request_expires_at timestamptz not null default (now() + interval '5 minutes'),
  approved_user_id uuid references public.profiles(user_id),
  approved_by uuid references public.profiles(user_id),
  approved_at timestamptz,
  session_expires_at timestamptz,
  ended_at timestamptz,
  constraint kiosk_pairing_code_format check (pairing_code ~ '^[0-9]{6}$')
);

create index if not exists kiosk_login_pending_idx
  on public.kiosk_login_requests(requested_at desc)
  where approved_at is null and ended_at is null;

alter table public.kiosk_login_requests enable row level security;
revoke all on public.kiosk_login_requests from public, anon, authenticated;

create or replace function public.kiosk_begin_login(p_device_label text default 'Store kiosk')
returns table(request_id uuid, request_secret uuid, pairing_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  created public.kiosk_login_requests;
begin
  insert into public.kiosk_login_requests(pairing_code, device_label)
  values (lpad(floor(random() * 1000000)::integer::text, 6, '0'), coalesce(nullif(trim(p_device_label), ''), 'Store kiosk'))
  returning * into created;
  return query select created.request_id, created.request_secret, created.pairing_code, created.request_expires_at;
end;
$$;

create or replace function public.kiosk_login_status(p_request_id uuid, p_request_secret uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  request public.kiosk_login_requests;
  result jsonb;
begin
  select * into request from public.kiosk_login_requests
  where request_id = p_request_id and request_secret = p_request_secret;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if request.ended_at is not null then return jsonb_build_object('status', 'ended'); end if;
  if request.approved_at is null and request.request_expires_at <= now() then return jsonb_build_object('status', 'expired'); end if;
  if request.approved_at is null then return jsonb_build_object('status', 'pending', 'expires_at', request.request_expires_at); end if;
  if request.session_expires_at <= now() then return jsonb_build_object('status', 'expired'); end if;

  select jsonb_build_object(
    'status', 'approved',
    'session_expires_at', request.session_expires_at,
    'profile', jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name),
    'membership', jsonb_build_object('number', m.membership_number, 'status', m.status, 'expires_at', m.expires_at, 'remaining_minutes', m.remaining_minutes),
    'progress', jsonb_build_object('points', coalesce(rp.total_points, 0), 'streak', coalesce(rp.current_streak_days, 0), 'rank', coalesce(mr.name, 'F')),
    'reading_sessions', (select count(*) from public.reading_logs l where l.user_id = p.user_id)
  ) into result
  from public.profiles p
  join public.memberships m on m.user_id = p.user_id and m.status = 'ACTIVE' and (m.expires_at is null or m.expires_at > now())
  left join public.reader_progress rp on rp.user_id = p.user_id
  left join public.membership_ranks mr on mr.rank_id = rp.rank_id
  where p.user_id = request.approved_user_id and p.is_active;

  return coalesce(result, jsonb_build_object('status', 'unavailable'));
end;
$$;

create or replace function public.kiosk_end_session(p_request_id uuid, p_request_secret uuid)
returns void language sql security definer set search_path = public as $$
  update public.kiosk_login_requests set ended_at = now()
  where request_id = p_request_id and request_secret = p_request_secret and ended_at is null;
$$;

create or replace function public.admin_list_kiosk_requests()
returns table(request_id uuid, pairing_code text, device_label text, requested_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  return query select r.request_id, r.pairing_code, r.device_label, r.requested_at, r.request_expires_at
  from public.kiosk_login_requests r
  where r.approved_at is null and r.ended_at is null and r.request_expires_at > now()
  order by r.requested_at desc;
end;
$$;

create or replace function public.admin_approve_kiosk_login(p_request_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then raise exception 'Staff access required'; end if;
  if not exists (
    select 1 from public.profiles p join public.memberships m using(user_id)
    where p.user_id = p_user_id and p.is_active and m.status = 'ACTIVE' and (m.expires_at is null or m.expires_at > now())
  ) then raise exception 'Select a reader with an active membership'; end if;

  update public.kiosk_login_requests
  set approved_user_id = p_user_id, approved_by = auth.uid(), approved_at = now(), session_expires_at = now() + interval '15 minutes'
  where request_id = p_request_id and approved_at is null and ended_at is null and request_expires_at > now();
  if not found then raise exception 'This kiosk request has expired or was already used'; end if;

  insert into public.audit_logs(actor_user_id, action, table_name, record_id, new_values)
  values(auth.uid(), 'APPROVE_KIOSK_LOGIN', 'kiosk_login_requests', p_request_id::text, jsonb_build_object('user_id', p_user_id));
end;
$$;

revoke all on function public.kiosk_begin_login(text) from public;
revoke all on function public.kiosk_login_status(uuid,uuid) from public;
revoke all on function public.kiosk_end_session(uuid,uuid) from public;
revoke all on function public.admin_list_kiosk_requests() from public;
revoke all on function public.admin_approve_kiosk_login(uuid,uuid) from public;
grant execute on function public.kiosk_begin_login(text) to anon, authenticated;
grant execute on function public.kiosk_login_status(uuid,uuid) to anon, authenticated;
grant execute on function public.kiosk_end_session(uuid,uuid) to anon, authenticated;
grant execute on function public.admin_list_kiosk_requests() to authenticated;
grant execute on function public.admin_approve_kiosk_login(uuid,uuid) to authenticated;
