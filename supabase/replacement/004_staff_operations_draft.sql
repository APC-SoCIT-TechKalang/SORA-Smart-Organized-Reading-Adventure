-- Librarian operations for the exact ERD. Requires 001-003 in test first.
-- All state changes are transactions inside these functions.
begin;

create function sora_v2.admin_activate_membership(
  p_user_id integer,
  p_membership_type text,
  p_membership_rank text,
  p_remaining_minutes integer,
  p_expires_at timestamptz,
  p_rfid text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_membership_id integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_membership_type not in ('Guild Member', 'Guild Adventurer', 'Wanderer')
    or nullif(btrim(p_membership_rank), '') is null
    or p_remaining_minutes is null or p_remaining_minutes < 0
    or p_expires_at is null or p_expires_at <= now() then
    raise exception 'Invalid membership details';
  end if;
  perform 1 from sora_v2.users where user_id = p_user_id and user_role = 'Reader' for update;
  if not found then raise exception 'Reader not found'; end if;
  update sora_v2.memberships set membership_status = 'EXPIRED'
  where user_id = p_user_id and membership_status = 'ACTIVE' and expires_at <= now();
  if exists (
    select 1 from sora_v2.memberships
    where user_id = p_user_id and membership_status = 'ACTIVE' and expires_at > now()
  ) then raise exception 'Reader already has an active membership'; end if;
  insert into sora_v2.memberships(user_id, membership_type, membership_rank,
    remaining_minutes, expires_at)
  values (p_user_id, p_membership_type, btrim(p_membership_rank),
    p_remaining_minutes, p_expires_at)
  returning membership_id into new_membership_id;
  if nullif(btrim(p_rfid), '') is not null then
    insert into sora_v2.librarycard(user_id, librarycard_rfid, created_at)
    values (p_user_id, btrim(p_rfid), now());
  end if;
  return new_membership_id;
end;
$$;

create function sora_v2.admin_top_up(
  p_membership_id integer,
  p_minutes integer,
  p_amount numeric,
  p_method text,
  p_reference text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare membership sora_v2.memberships%rowtype;
  new_topup_id integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_minutes is null or p_minutes <= 0 or p_amount is null or p_amount < 0
    or p_method not in ('Cash', 'Gcash', 'Card') then
    raise exception 'Invalid top-up details';
  end if;
  select * into membership from sora_v2.memberships
  where membership_id = p_membership_id for update;
  if membership.membership_id is null or membership.membership_status <> 'ACTIVE'
    or membership.expires_at <= now() then
    raise exception 'Active membership not found';
  end if;
  if membership.membership_type = 'Guild Adventurer' then
    raise exception 'This membership has unlimited reading time';
  end if;
  update sora_v2.memberships
  set remaining_minutes = remaining_minutes + p_minutes
  where membership_id = p_membership_id;
  insert into sora_v2.topup_transactions(processed_by, membership_id,
    minutes_added, payment_status, amount_paid, payment_method, payment_reference)
  values (sora_v2.current_user_id(), p_membership_id,
    p_minutes, 'PAID', p_amount, p_method, nullif(btrim(p_reference), ''))
  returning topup_id into new_topup_id;
  return new_topup_id;
end;
$$;

create function sora_v2.admin_shelve(p_copy_id integer)
returns void language plpgsql security definer set search_path = '' as $$
declare copy sora_v2.book_copies%rowtype;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  select * into copy from sora_v2.book_copies where copy_id = p_copy_id for update;
  if copy.copy_id is null or copy.copy_status <> 'In Return Cart' then
    raise exception 'Copy must be on the return cart';
  end if;
  update sora_v2.book_copies set copy_status = 'In-Shelf' where copy_id = p_copy_id;
  insert into sora_v2.session_activity_logs(user_id, book_id, copy_id, action)
  values (sora_v2.current_user_id(), copy.book_id, p_copy_id, 'SHELVED');
end;
$$;

create function sora_v2.admin_create_book(
  p_title text,
  p_author_firstname text,
  p_author_lastname text,
  p_book_type text,
  p_age_rating integer,
  p_genre text default 'General',
  p_isbn text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_author_id integer;
  new_book_id integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(btrim(p_title), '') is null
    or nullif(btrim(p_author_firstname), '') is null
    or nullif(btrim(p_author_lastname), '') is null
    or p_book_type not in ('Manga', 'Light Novel', 'Adult Manga')
    or p_age_rating is null or p_age_rating < 0 then
    raise exception 'Invalid book details';
  end if;
  select a.author_id into v_author_id from sora_v2.authors a
  where a.author_firstname = btrim(p_author_firstname)
    and a.author_lastname = btrim(p_author_lastname)
  order by a.author_id limit 1;
  if v_author_id is null then
    insert into sora_v2.authors(author_firstname, author_lastname)
    values (btrim(p_author_firstname), btrim(p_author_lastname))
    returning author_id into v_author_id;
  end if;
  insert into sora_v2.books(author_id, title, book_type, age_rating,
    book_genre, isbn)
  values (v_author_id, btrim(p_title), p_book_type, p_age_rating,
    coalesce(nullif(btrim(p_genre), ''), 'General'), nullif(btrim(p_isbn), ''))
  returning book_id into new_book_id;
  return new_book_id;
end;
$$;

create function sora_v2.admin_add_copy(p_book_id integer, p_barcode text)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_number integer;
declare new_copy_id integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(btrim(p_barcode), '') is null then raise exception 'Barcode is required'; end if;
  perform 1 from sora_v2.books where book_id = p_book_id for update;
  if not found then raise exception 'Book not found'; end if;
  select coalesce(max(copy_number), 0) + 1 into next_number
  from sora_v2.book_copies where book_id = p_book_id;
  insert into sora_v2.book_copies(book_id, copy_number, barcode)
  values (p_book_id, next_number, btrim(p_barcode))
  returning copy_id into new_copy_id;
  return new_copy_id;
end;
$$;

create function sora_v2.admin_update_book_cover(
  p_book_id integer, p_cover_image_url text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  update sora_v2.books
  set coverimage_url = nullif(btrim(p_cover_image_url), '')
  where book_id = p_book_id;
  if not found then raise exception 'Book not found'; end if;
end;
$$;

create function sora_v2.admin_create_quest(
  p_name text, p_difficulty text, p_description text,
  p_requirement text, p_points integer, p_target_genre text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_quest_id integer;
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_difficulty), '') is null
    or nullif(btrim(p_description), '') is null
    or nullif(btrim(p_requirement), '') is null
    or p_points is null or p_points < 0 then
    raise exception 'Invalid quest details';
  end if;
  insert into sora_v2.quests(quest_name, quest_difficulty,
    quest_description, quest_requirement, target_genre, points_reward,
    reviewed_by, review_decision)
  values (btrim(p_name), btrim(p_difficulty), btrim(p_description),
    btrim(p_requirement), nullif(btrim(p_target_genre), ''), p_points,
    sora_v2.current_user_id(), 'VERIFIED')
  returning quest_id into new_quest_id;
  return new_quest_id;
end;
$$;

create function sora_v2.admin_complete_quest(p_user_quest_id integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not sora_v2.is_librarian() then raise exception 'Librarian access required'; end if;
  update sora_v2.user_quests
  set quest_status = 'COMPLETED', completed_at = now()
  where user_quest_id = p_user_quest_id and quest_status = 'IN PROGRESS';
  if not found then raise exception 'Quest enrollment not found'; end if;
end;
$$;

revoke all on function sora_v2.admin_activate_membership(integer,text,text,integer,timestamptz,text) from public, anon, authenticated;
revoke all on function sora_v2.admin_top_up(integer,integer,numeric,text,text) from public, anon, authenticated;
revoke all on function sora_v2.admin_shelve(integer) from public, anon, authenticated;
revoke all on function sora_v2.admin_create_book(text,text,text,text,integer,text,text) from public, anon, authenticated;
revoke all on function sora_v2.admin_add_copy(integer,text) from public, anon, authenticated;
revoke all on function sora_v2.admin_update_book_cover(integer,text) from public, anon, authenticated;
revoke all on function sora_v2.admin_create_quest(text,text,text,text,integer,text) from public, anon, authenticated;
revoke all on function sora_v2.admin_complete_quest(integer) from public, anon, authenticated;
grant execute on function sora_v2.admin_activate_membership(integer,text,text,integer,timestamptz,text) to authenticated;
grant execute on function sora_v2.admin_top_up(integer,integer,numeric,text,text) to authenticated;
grant execute on function sora_v2.admin_shelve(integer) to authenticated;
grant execute on function sora_v2.admin_create_book(text,text,text,text,integer,text,text) to authenticated;
grant execute on function sora_v2.admin_add_copy(integer,text) to authenticated;
grant execute on function sora_v2.admin_update_book_cover(integer,text) to authenticated;
grant execute on function sora_v2.admin_create_quest(text,text,text,text,integer,text) to authenticated;
grant execute on function sora_v2.admin_complete_quest(integer) to authenticated;

commit;
