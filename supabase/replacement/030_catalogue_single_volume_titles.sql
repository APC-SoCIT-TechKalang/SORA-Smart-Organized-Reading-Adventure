-- Show full edition titles for single-volume catalog groups. Multi-volume
-- collections remain grouped under their English series title.
begin;

create or replace view sora_v2.admin_catalogue_members
with (security_invoker = true) as
with candidates as (
  select b.book_id, b.title, b.coverimage_url, b.book_genre, b.isbn,
    b.original_title, b.romanized_title, b.book_type,
    trim(concat_ws(' ', a.author_firstname, a.author_lastname)) as author,
    coalesce(nullif(trim(b.series_name), ''),
      nullif(trim(substring(b.book_genre from '(?i)(?:^|,)\s*series:\s*([^,]+)')), '')) as series,
    regexp_match(b.title, '(?i)^(.+?)(?:[\s,]+(?:vol(?:ume)?\.?\s*|#)|\s+)([0-9]+)(?:\s*[:\-].*)?$') as suffix,
    regexp_match(b.title, '(?i)^(.+?)[\s,]+vol(?:ume)?\.?\s*([0-9]+)(?:\s*[:\-].*)?$') as explicit_volume,
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
    count(*) as member_count, count(distinct volume_order) as numbered_volumes
  from keyed
  group by series_key
)
select k.book_id, k.title, k.coverimage_url, k.book_genre, k.isbn, k.original_title, k.romanized_title,
  k.author, k.volume_order,
  case when identity.is_series then k.series_key else k.book_id::text end as group_id,
  case
    when identity.is_series and e.member_count > 1 then coalesce(e.name, trim(k.suffix[1]), k.title)
    else sora_v2.standard_catalog_title(
      k.title,
      coalesce(k.series, trim(k.explicit_volume[1])),
      coalesce(k.volume_number, k.explicit_volume[2]::integer),
      k.book_type
    )
  end::character varying as group_title
from keyed k join evidence e using (series_key)
cross join lateral (
  select k.series is not null or (k.author <> '' and k.volume_order is not null
    and (e.name is not null or e.numbered_volumes > 1)) as is_series
) identity;

revoke all on sora_v2.admin_catalogue_members from public, anon, authenticated;
grant select on sora_v2.admin_catalogue_members to authenticated;

commit;
