-- Read-only value inventory for fields that need explicit conversion.
-- Returns one table. No names, contact details, or account identifiers.
select category, current_value, record_count
from (
  select 'book_age_rating' as category,
         coalesce(age_rating, '<NULL>') as current_value,
         count(*) as record_count
  from public.books
  group by age_rating

  union all
  select 'book_type', coalesce(book_type, '<NULL>'), count(*)
  from public.books
  group by book_type

  union all
  select 'seat_number_and_area', seat_number || ' | ' || coalesce(area, '<NULL>'), count(*)
  from public.seats
  group by seat_number, area

  union all
  select 'membership_without_minutes', coalesce(t.name, '<NULL>'), count(*)
  from public.memberships m
  left join public.membership_types t on t.membership_type_id = m.membership_type_id
  where m.remaining_minutes is null
  group by t.name

  union all
  select 'copy_status', status, count(*)
  from public.book_copies
  group by status

  union all
  select 'visit_type', visitor_type, count(*)
  from public.visits
  group by visitor_type
) values_to_review
order by category, current_value;
