-- Read-only migration summary. Run this single query in Supabase SQL Editor.
-- Export the one results table as CSV, or send a screenshot of all rows.
select metric, value
from (values
  ('profiles', (select count(*) from public.profiles)),
  ('books', (select count(*) from public.books)),
  ('book_copies', (select count(*) from public.book_copies)),
  ('memberships', (select count(*) from public.memberships)),
  ('visits', (select count(*) from public.visits)),
  ('reading_logs', (select count(*) from public.reading_logs)),
  ('quests', (select count(*) from public.quests)),
  ('quest_progress', (select count(*) from public.quest_progress)),
  ('points_ledger', (select count(*) from public.points_ledger)),
  ('seats', (select count(*) from public.seats)),
  ('users_missing_username', (select count(*) from public.profiles where username is null)),
  ('users_missing_birthdate', (select count(*) from public.profiles where birthday is null)),
  ('users_missing_mobile', (
    select count(*) from public.profiles p
    left join auth.users a on a.id = p.user_id
    where a.phone is null
  )),
  ('books_unsupported_type', (
    select count(*) from public.books
    where book_type is null or book_type not in ('Manga', 'Light Novel', 'Adult Manga')
  )),
  ('books_nonnumeric_volume', (
    select count(*) from public.books
    where volume_number is not null and volume_number !~ '^[0-9]+$'
  )),
  ('books_nonnumeric_age_rating', (
    select count(*) from public.books
    where age_rating is null or age_rating !~ '^[0-9]+$'
  )),
  ('books_missing_author', (
    select count(*) from public.books where author is null or btrim(author) = ''
  )),
  ('seats_nonnumeric_number', (
    select count(*) from public.seats where seat_number !~ '^[0-9]+$'
  )),
  ('memberships_without_minutes', (
    select count(*) from public.memberships where remaining_minutes is null
  )),
  ('memberships_without_expiry', (
    select count(*) from public.memberships where expires_at is null
  )),
  ('walk_in_visits', (
    select count(*) from public.visits where visitor_type = 'WALK_IN'
  )),
  ('visits_without_user', (
    select count(*) from public.visits where user_id is null
  )),
  ('reading_logs_without_user', (
    select count(*) from public.reading_logs where user_id is null
  )),
  ('visits_with_multiple_open_books', (
    select count(*) from (
      select visit_id from public.reading_logs
      where returned_at is null group by visit_id having count(*) > 1
    ) multi_book_visits
  )),
  ('negative_quest_rewards', (
    select count(*) from public.quests where points_reward < 0
  )),
  ('other_quest_types', (
    select count(*) from public.quests
    where quest_type not in ('MAIN', 'SIDE', 'COLLECTION', 'WEEKLY', 'EVENT')
  ))
) as checks(metric, value)
order by metric;
