-- Read-only catalog workspace. Caller privileges and existing RLS still apply.
begin;

create or replace view sora_v2.admin_catalogue_members
with (security_invoker = true) as
with candidates as (
  select b.book_id, b.title, b.coverimage_url, b.book_genre, b.isbn,
    b.original_title, b.romanized_title, b.book_type,
    trim(concat_ws(' ', a.author_firstname, a.author_lastname)) as author,
    coalesce(nullif(trim(b.series_name), ''),
      nullif(trim(substring(b.book_genre from '(?i)(?:^|,)\s*series:\s*([^,]+)')), '')) as series,
    regexp_match(b.title, '(?i)^(.+?)(?:[\s,]+(?:vol(?:ume)?\.?\s*|#)|\s+)([0-9]+)(?:\s*[:–—].*)?$') as suffix,
    b.volume_number
  from sora_v2.books b
  join sora_v2.authors a using (author_id)
  where (select sora_v2.is_librarian())
), keyed as (
  select *,
    jsonb_build_array(
      lower(regexp_replace(trim(coalesce(series, suffix[1], title)), '\s+', ' ', 'g')),
      lower(regexp_replace(author, '\s+', ' ', 'g')), lower(trim(book_type))
    )::text as series_key,
    coalesce(volume_number::numeric, suffix[2]::numeric) as volume_order
  from candidates
), evidence as (
  select series_key, (array_agg(series order by book_id) filter (where series is not null))[1] as name,
    count(distinct volume_order) as numbered_volumes
  from keyed
  group by series_key
)
select k.book_id, k.title, k.coverimage_url, k.book_genre, k.isbn, k.original_title, k.romanized_title,
  k.author, k.volume_order,
  case when identity.is_series then k.series_key else k.book_id::text end as group_id,
  case when identity.is_series then coalesce(e.name, trim(k.suffix[1]), k.title) else k.title end as group_title
from keyed k join evidence e using (series_key)
cross join lateral (
  select k.series is not null or (k.author <> '' and k.volume_order is not null
    and (e.name is not null or e.numbered_volumes > 1)) as is_series
) identity;

revoke all on sora_v2.admin_catalogue_members from public, anon, authenticated;
grant select on sora_v2.admin_catalogue_members to authenticated;

create or replace function sora_v2.admin_catalogue_summary()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if sora_v2.is_librarian() is not true then
    raise exception 'Librarian access required' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'titles', (select count(distinct group_id) from sora_v2.admin_catalogue_members),
      'volumes', (select count(*) from sora_v2.books),
      'unregistered', (select count(*) from sora_v2.books b where not exists
        (select 1 from sora_v2.book_copies c where c.book_id = b.book_id)),
      'copies', count(*),
      'returns', count(*) filter (where copy_status = 'In Return Cart'),
      'damaged', count(*) filter (where copy_status = 'Damaged'),
      'genres', (select coalesce(jsonb_agg(genre order by genre), '[]') from (
        select distinct trim(tag) as genre from sora_v2.books b,
          lateral unnest(string_to_array(b.book_genre, ',')) tag
        where trim(tag) <> '' and trim(tag) !~* '^(series|franchise):'
      ) g),
      'shelves', coalesce(to_jsonb(array_agg(distinct shelf_location order by shelf_location)
        filter (where shelf_location is not null)), '[]'::jsonb)
    ) from sora_v2.book_copies
  );
end;
$$;

create or replace function sora_v2.admin_catalogue_page(
  p_view text, p_query text default '', p_genre text default '', p_status text default '',
  p_condition text default '', p_shelf text default '', p_registered text default '',
  p_sort text default 'title', p_page integer default 1, p_size integer default 25,
  p_book integer default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  page_size integer := case when p_size in (25, 50, 100) then p_size else 25 end;
  page_offset bigint := (greatest(coalesce(p_page, 1), 1)::bigint - 1) * page_size;
  needle text := lower(trim(coalesce(p_query, '')));
begin
  if sora_v2.is_librarian() is not true then
    raise exception 'Librarian access required' using errcode = '42501';
  end if;
  if p_view is null or p_view not in ('catalog', 'inventory', 'attention') then
    raise exception 'Unknown catalog view';
  end if;

  return (
    with members as materialized (select * from sora_v2.admin_catalogue_members),
    registered as materialized (select distinct book_id from sora_v2.book_copies),
    books as materialized (
      select m.*, r.book_id is not null as has_copies,
        needle = '' or strpos(lower(concat_ws(' ', m.title, m.group_title, m.author, m.isbn,
          m.original_title, m.romanized_title, m.group_title || ' ' || m.volume_order,
          m.group_title || ' vol. ' || m.volume_order, m.group_title || ' volume ' || m.volume_order)), needle) > 0 as matches_text
      from members m left join registered r using (book_id)
      where (p_book is null or p_book = m.book_id)
        and (coalesce(p_genre, '') = '' or exists (
          select 1 from unnest(string_to_array(m.book_genre, ',')) tag where lower(trim(tag)) = lower(p_genre)))
        and (coalesce(p_registered, '') = '' or
          (p_registered = 'yes' and r.book_id is not null) or
          (p_registered = 'no' and r.book_id is null))
    ),
    matching_copies as materialized (
      select c.copy_id, c.book_id, c.barcode, c.copy_number, c.copy_status, c.shelf_location,
        case when p_view <> 'catalog' then c.condition_notes end as condition_notes
      from sora_v2.book_copies c join books b using (book_id)
      where (b.matches_text or strpos(lower(c.barcode), needle) > 0)
        and (coalesce(p_status, '') = '' or c.copy_status = p_status)
        and (coalesce(p_shelf, '') = '' or c.shelf_location = p_shelf or (p_shelf = 'unassigned' and c.shelf_location is null))
        and (coalesce(p_condition, '') = '' or
          (p_condition = 'noted' and nullif(trim(c.condition_notes), '') is not null) or
          (p_condition = 'blank' and nullif(trim(c.condition_notes), '') is null))
        and (p_view <> 'attention' or c.copy_status in ('Damaged', 'In Return Cart'))
    ),
    copy_matches as (select distinct book_id from matching_copies),
    matching_books as (
      select b.* from books b
      left join copy_matches c using (book_id)
      where (b.matches_text and coalesce(p_status, '') = '' and coalesce(p_shelf, '') = ''
        and coalesce(p_condition, '') = '')
        or c.book_id is not null
    ),
    group_matches as (
      select group_id from matching_books where p_view = 'catalog' group by group_id
    ),
    grouped as (
      select m.group_id,
        (array_agg(m.group_title order by m.volume_order nulls last, m.book_id))[1] as title,
        (array_agg(m.author order by m.volume_order nulls last, m.book_id))[1] as author,
        (array_agg(m.coverimage_url order by m.volume_order nulls last, m.book_id)
          filter (where nullif(trim(m.coverimage_url), '') is not null))[1] as cover,
        count(*) as volumes
      from members m join group_matches g using (group_id)
      group by m.group_id
    ),
    records as materialized (
      select g.group_id as id, g.title, g.author, 'group'::text as kind, to_jsonb(g) as payload
      from grouped g
      union all
      select c.copy_id::text, b.title, b.author, 'copy',
        to_jsonb(c) || jsonb_build_object('volume', b.volume_order)
      from matching_copies c join books b using (book_id)
      where p_view <> 'catalog'
      union all
      select b.book_id::text, b.title, b.author, 'unregistered',
        jsonb_build_object('book_id', b.book_id, 'group_id', b.group_id)
      from matching_books b
      where p_view = 'attention' and not b.has_copies
    ),
    page_rows as materialized (
      select * from records
      order by case when p_sort = 'author' then lower(author) end, lower(title), kind, id
      limit page_size offset page_offset
    ),
    status_counts as (
      select m.group_id, c.copy_status, count(*) as quantity
      from page_rows p join members m on p.kind = 'group' and m.group_id = p.id
      join sora_v2.book_copies c using (book_id)
      group by m.group_id, c.copy_status
    ),
    totals as (
      select group_id, sum(quantity) as copies, jsonb_object_agg(copy_status, quantity) as statuses
      from status_counts group by group_id
    )
    select jsonb_build_object(
      'count', (select count(*) from records),
      'rows', coalesce(jsonb_agg(p.payload || jsonb_build_object('id', p.id, 'kind', p.kind,
        'title', p.title, 'author', p.author, 'copies', coalesce(t.copies, 0),
        'statuses', coalesce(t.statuses, '{}'::jsonb))
        order by case when p_sort = 'author' then lower(p.author) end, lower(p.title), p.kind, p.id), '[]')
    ) from page_rows p left join totals t on t.group_id = p.id and p.kind = 'group'
  );
end;
$$;

create or replace function sora_v2.admin_catalogue_volumes(
  p_group text, p_page integer default 1, p_book integer default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if sora_v2.is_librarian() is not true then
    raise exception 'Librarian access required' using errcode = '42501';
  end if;
  return (
    with group_members as materialized (
      select book_id, volume_order from sora_v2.admin_catalogue_members
      where group_id = p_group and (p_book is null or book_id = p_book)
    ), page_members as (
      select * from group_members order by volume_order nulls last, book_id
      limit 25 offset ((greatest(coalesce(p_page, 1), 1)::bigint - 1) * 25)
    ), counts as (
      select c.book_id, count(distinct c.copy_id) as copies, count(s.session_id) as reads
      from page_members p join sora_v2.book_copies c using (book_id)
      left join sora_v2.sessions s on s.copy_id = c.copy_id group by c.book_id
    )
    select jsonb_build_object(
      'count', (select count(*) from group_members),
      'rows', coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object(
        'authors', to_jsonb(a), 'copies', coalesce(c.copies, 0), 'reads', coalesce(c.reads, 0),
        'display_volume', p.volume_order
      ) order by p.volume_order nulls last, p.book_id), '[]')
    ) from page_members p join sora_v2.books b using (book_id)
      join sora_v2.authors a using (author_id)
      left join counts c using (book_id)
  );
end;
$$;

revoke all on function sora_v2.admin_catalogue_summary(),
  sora_v2.admin_catalogue_page(text,text,text,text,text,text,text,text,integer,integer,integer),
  sora_v2.admin_catalogue_volumes(text,integer,integer) from public, anon, authenticated;
grant execute on function sora_v2.admin_catalogue_summary(),
  sora_v2.admin_catalogue_page(text,text,text,text,text,text,text,text,integer,integer,integer),
  sora_v2.admin_catalogue_volumes(text,integer,integer) to authenticated;

-- books / barcode / (book_id, copy_number) already have indexes from their constraints.
create index if not exists admin_catalogue_sessions_copy_idx on sora_v2.sessions (copy_id);

commit;
