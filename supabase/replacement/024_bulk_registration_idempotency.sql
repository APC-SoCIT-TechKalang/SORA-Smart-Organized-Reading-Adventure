-- Safe retries for large bulk-registration sessions. The underlying registration
-- function remains responsible for consecutive, unique physical-copy barcodes.
begin;

create table if not exists sora_v2.book_registration_requests (
  request_id uuid primary key,
  requested_by uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

alter table sora_v2.book_registration_requests enable row level security;
revoke all on sora_v2.book_registration_requests from anon, authenticated;

create or replace function sora_v2.admin_register_books_idempotent(
  p_request_id uuid,
  p_entries jsonb
) returns jsonb
language plpgsql
security definer
set search_path = sora_v2, public
as $$
declare
  v_user_id uuid := sora_v2.current_user_id();
  v_response jsonb;
  v_requested_by uuid;
begin
  if not sora_v2.is_librarian() then
    raise exception 'Only librarians can register books';
  end if;

  if p_request_id is null then
    raise exception 'A request ID is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select response, requested_by into v_response, v_requested_by
  from sora_v2.book_registration_requests
  where request_id = p_request_id;

  if found then
    if v_requested_by <> v_user_id then
      raise exception 'This request ID belongs to another user';
    end if;
    return v_response;
  end if;

  v_response := sora_v2.admin_register_books(p_entries);

  insert into sora_v2.book_registration_requests(request_id, requested_by, response)
  values (p_request_id, v_user_id, v_response);

  return v_response;
end;
$$;

revoke all on function sora_v2.admin_register_books_idempotent(uuid, jsonb) from public;
grant execute on function sora_v2.admin_register_books_idempotent(uuid, jsonb) to authenticated;

commit;
