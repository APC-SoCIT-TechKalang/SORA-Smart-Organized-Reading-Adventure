-- Read-only checks against the CURRENT public schema. Run in the Supabase SQL
-- Editor and save the results before attempting any data conversion.

select 'profiles' as source, count(*) as rows from public.profiles
union all select 'books', count(*) from public.books
union all select 'book_copies', count(*) from public.book_copies
union all select 'memberships', count(*) from public.memberships
union all select 'visits', count(*) from public.visits
union all select 'reading_logs', count(*) from public.reading_logs
union all select 'quests', count(*) from public.quests
union all select 'quest_progress', count(*) from public.quest_progress
union all select 'points_ledger', count(*) from public.points_ledger
union all select 'seats', count(*) from public.seats
order by source;

select
  count(*) filter (where p.username is null) as missing_username,
  count(*) filter (where p.birthday is null) as missing_birthdate,
  count(*) filter (where a.phone is null) as missing_phone,
  count(*) filter (where a.id is null) as missing_auth_user
from public.profiles p
left join auth.users a on a.id = p.user_id;

select
  count(*) filter (where book_type is null or book_type not in ('Manga', 'Light Novel', 'Adult Manga')) as unsupported_book_type,
  count(*) filter (where volume_number is not null and volume_number !~ '^[0-9]+$') as nonnumeric_volume,
  count(*) filter (where age_rating is null or age_rating !~ '^[0-9]+$') as nonnumeric_age_rating,
  count(*) filter (where author is null or btrim(author) = '') as missing_author
from public.books;

select status, count(*) as copies from public.book_copies group by status order by status;
select seat_number, area from public.seats where seat_number !~ '^[0-9]+$' order by seat_number;

select
  count(*) filter (where remaining_minutes is null) as unlimited_or_missing_minutes,
  count(*) filter (where expires_at is null) as no_expiry,
  count(*) filter (where status = 'ACTIVE') as active_memberships
from public.memberships;

select
  count(*) filter (where visitor_type = 'WALK_IN') as walk_in_visits,
  count(*) filter (where user_id is null) as visits_without_user,
  count(*) filter (where membership_id is null) as visits_without_membership
from public.visits;

select
  count(*) filter (where user_id is null) as reading_logs_without_user,
  count(*) filter (where returned_at is null) as open_reading_logs
from public.reading_logs;

select visit_id, count(*) as simultaneous_books
from public.reading_logs
where returned_at is null
group by visit_id
having count(*) > 1
order by simultaneous_books desc, visit_id;

select
  count(*) filter (where points_reward < 0) as negative_quest_rewards,
  count(*) filter (where quest_type not in ('MAIN', 'SIDE', 'COLLECTION', 'WEEKLY', 'EVENT')) as other_quest_types
from public.quests;

select reason_type, count(*) as entries, sum(amount) as amount
from public.points_ledger
group by reason_type
order by reason_type;
