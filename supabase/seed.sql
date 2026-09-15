-- Non-sensitive reference data for the SORA development project.
-- Run after 001_initial_schema.sql.

insert into public.roles (name, description)
values
  ('reader', 'Authenticated Guild Member or Guild Adventurer'),
  ('admin', 'Staff administrator who manages library operations and system configuration')
on conflict (name) do update
set description = excluded.description;

insert into public.membership_types (
  name,
  entry_type,
  default_session_minutes,
  standard_hours,
  extended_hours,
  can_view_quests,
  can_vote,
  can_reserve_seat,
  can_borrow,
  min_age
)
values
  ('Wanderer', 'WALK_IN', null, true, false, false, false, false, false, null),
  ('Guild Member', 'HOURLY', null, true, false, true, true, false, false, 13),
  ('Guild Adventurer', 'UNLIMITED', null, true, true, true, true, true, false, 18)
on conflict (name) do update
set entry_type = excluded.entry_type,
    standard_hours = excluded.standard_hours,
    extended_hours = excluded.extended_hours,
    can_view_quests = excluded.can_view_quests,
    can_vote = excluded.can_vote,
    can_reserve_seat = excluded.can_reserve_seat,
    can_borrow = excluded.can_borrow,
    min_age = excluded.min_age;

insert into public.shelves (name, shelf_code, access_rank, min_age, is_public_location)
values
  ('General', 'GEN', null, null, false),
  ('Spotlight', 'SPO', null, null, false),
  ('Mature', 'MAT', 'E', 18, false),
  ('New Releases', 'NEW', 'C', null, false),
  ('Collectors', 'COL', 'A', null, false)
on conflict (name) do update
set shelf_code = excluded.shelf_code,
    access_rank = excluded.access_rank,
    min_age = excluded.min_age;

insert into public.membership_ranks (
  name,
  minimum_regular_quests,
  minimum_special_quests,
  minimum_points,
  max_membership_type,
  description
)
values
  ('F', 0, 0, 0, null, 'Starting rank for Guild Members and Guild Adventurers'),
  ('E', 5, 0, 0, null, 'Rank threshold from the library handbook'),
  ('D', 10, 1, 0, null, 'Rank threshold from the library handbook'),
  ('C', 20, 2, 0, null, 'Rank threshold from the library handbook'),
  ('B3', 30, 3, 0, null, 'Rank threshold from the library handbook'),
  ('B2', 40, 4, 0, null, 'Rank threshold from the library handbook'),
  ('B1', 50, 5, 0, null, 'Rank threshold from the library handbook'),
  ('A3', 75, 7, 0, null, 'Rank threshold from the library handbook'),
  ('A2', 100, 10, 0, null, 'Rank threshold from the library handbook'),
  ('A1', 150, 15, 0, null, 'Rank threshold from the library handbook'),
  ('S', 200, 20, 0, 'UNLIMITED', 'Guild Adventurer rank from the library handbook'),
  ('SS', 200, 20, 0, 'UNLIMITED', 'Unlock and borrowing rules require final confirmation')
on conflict (name) do update
set minimum_regular_quests = excluded.minimum_regular_quests,
    minimum_special_quests = excluded.minimum_special_quests,
    minimum_points = excluded.minimum_points,
    max_membership_type = excluded.max_membership_type,
    description = excluded.description;

insert into public.seats (seat_number, area)
values
  ('A-01', 'Main Reading Area'),
  ('A-02', 'Main Reading Area'),
  ('A-03', 'Main Reading Area'),
  ('B-01', 'Main Reading Area'),
  ('B-02', 'Main Reading Area')
on conflict (seat_number) do nothing;
